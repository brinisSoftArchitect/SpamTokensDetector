// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const categorizer = require('./categorizer');
const gateioService = require('./gateioService');
const holderConcentrationService = require('./holderConcentrationService');
const blockchainService = require('./blockchainService');
const mongoose = require('mongoose');

// Token Analysis Schema
const tokenAnalysisSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true, index: true },
    globalSpamScore: { type: Number, default: 0 },
    overallRisk: { type: String, default: 'UNKNOWN' },
    isSpamGlobally: { type: Boolean, default: false },
    gapHunterBotRisk: {
        riskPercentage: { type: Number, default: 0 },
        shouldSkip: { type: Boolean, default: false },
        hardSkip: { type: Boolean, default: false }
    },
    networks: {
        type: Map,
        of: {
            address: String,
            top10Percentage: Number
        }
    },
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

const TokenAnalysis = mongoose.model('TokenAnalysis', tokenAnalysisSchema);

class CronService {
    constructor() {
        this.symbols = [];
        this.isRunning = false;
        this.useGateioTokens = process.env.USE_GATEIO_TOKENS === 'true';
        this.maxTokensToAnalyze = parseInt(process.env.MAX_TOKENS_TO_ANALYZE || '3000');
        this.mongoConnected = false;
        this.initMongo();
    }

    async initMongo() {
        try {
            if (process.env.MONGO_URI) {
                await mongoose.connect(process.env.MONGO_URI);
                this.mongoConnected = true;
                console.log('✅ MongoDB connected for token analysis storage');
            } else {
                console.log('⚠️ MONGO connection string not found in .env');
            }
        } catch (err) {
            console.error('❌ MongoDB connection failed:', err.message);
            this.mongoConnected = false;
        }
    }

    // ── progress helpers ──────────────────────────────────────────────────────
    async loadProgress() {
        try {
            const mongoService = require('./mongoService');
            await mongoService.connect();
            const doc = await mongoService.db.collection('appProgress').findOne({ _id: 'cronProgress' });
            if (doc) return { analyzedTokens: doc.analyzedTokens || [], extraSymbols: doc.extraSymbols || [], lastUpdate: doc.lastUpdate || null };
            return { analyzedTokens: [], extraSymbols: [], lastUpdate: null };
        } catch {
            return { analyzedTokens: [], extraSymbols: [], lastUpdate: null };
        }
    }

    async saveProgress(progress) {
        try {
            const mongoService = require('./mongoService');
            await mongoService.connect();
            await mongoService.db.collection('appProgress').updateOne(
                { _id: 'cronProgress' },
                { $set: {
                    analyzedTokens: progress.analyzedTokens || [],
                    extraSymbols: progress.extraSymbols || [],
                    lastUpdate: progress.lastUpdate || new Date().toISOString()
                }},
                { upsert: true }
            );
        } catch (err) {
            console.error('Error saving cron progress:', err.message);
        }
    }

    async getAllSymbols() {
        if (this.useGateioTokens) {
            const gateioTokens = await gateioService.getAllTokenSymbols();
            if (gateioTokens.length > 0) return gateioTokens.slice(0, this.maxTokensToAnalyze);
        }
        // Fallback: fetch ALL pairs from Gate.io regardless of env flag
        try {
            const allPairs = await gateioService.getAllTokenSymbols();
            if (allPairs && allPairs.length > 0) {
                console.log(`📋 Loaded ${allPairs.length} pairs from Gate.io (fallback)`);
                return allPairs.slice(0, this.maxTokensToAnalyze);
            }
        } catch (e) {
            console.warn('⚠️ Gate.io fallback failed:', e.message);
        }
        const symbolList = process.env.SYMBOLS_TO_ANALYZE || 'BTC,ETH,USDT,BNB,SOL,XRP,DOGE,ADA,AVAX,MATIC';
        return symbolList.split(',').map(s => s.trim());
    }

    // ── analyse ONE token then save immediately ───────────────────────────────
    async analyzeNextToken() {
        if (this.isRunning) {
            console.log('⏭️  Cron tick skipped — previous analysis still running');
            return;
        }
        this.isRunning = true;

        try {
            const mongoService = require('./mongoService');
            const allSymbols = await this.getAllSymbols();
            const progress   = await this.loadProgress();

            // reset cycle when all symbols have been processed
            const analyzed = new Set(progress.analyzedTokens.map(s => s.toUpperCase()));
            let remaining = allSymbols.filter(s => !analyzed.has(s.toUpperCase()));

            if (remaining.length === 0) {
                console.log('\n🔄 Full cycle complete — also rechecking undefined tokens before reset');

                // Recheck undefined tokens before starting new cycle
                try {
                    const port = process.env.PORT || 3005;
                    const catResp = await axios.get(`http://localhost:${port}/api/categories`, { timeout: 15000 });
                    const undefinedList = catResp.data?.lists?.undefined || [];
                    if (undefinedList.length > 0) {
                        console.log(`🔁 Found ${undefinedList.length} undefined tokens — adding to next cycle`);
                        await this.saveProgress({
                            analyzedTokens: [],
                            extraSymbols: undefinedList,
                            lastUpdate: new Date().toISOString()
                        });
                    } else {
                        await this.saveProgress({ analyzedTokens: [], lastUpdate: new Date().toISOString() });
                    }
                } catch (e) {
                    console.warn('⚠️ Could not fetch undefined tokens for recheck:', e.message);
                    await this.saveProgress({ analyzedTokens: [], lastUpdate: new Date().toISOString() });
                }

                this.isRunning = false;
                return;
            }

            // merge in any extra undefined symbols saved from previous cycle end
            if (progress.extraSymbols && progress.extraSymbols.length > 0) {
                const extraSet = progress.extraSymbols.map(s => s.toUpperCase());
                const merged = [...new Set([...allSymbols.map(s => s.toUpperCase()), ...extraSet])];
                allSymbols.splice(0, allSymbols.length, ...merged);
            }

            // pick the next symbol — prefer missing/incomplete over complete
            const allTokens = await mongoService.getAllTokens({ limit: 10000 });
            const dbMap = {};
            allTokens.forEach(t => { dbMap[t.symbol] = t; });

            const isMissing    = s => !dbMap[s.toUpperCase()];
            const isIncomplete = s => {
                const d = dbMap[s.toUpperCase()];
                if (!d) return false;
                const hasRisk   = d.riskPercentage !== undefined && d.riskPercentage !== null && !isNaN(d.riskPercentage);
                const hasHolder = d.holderConcentration &&
                                  typeof d.holderConcentration.top10Percentage === 'number' &&
                                  !isNaN(d.holderConcentration.top10Percentage) &&
                                  d.holderConcentration.top10Percentage >= 0;
                return !hasRisk || !hasHolder;
            };

            const symbol =
                remaining.find(isMissing) ||
                remaining.find(isIncomplete) ||
                remaining[0];

            const total     = allSymbols.length;
            const doneCount = analyzed.size;
            console.log(`\n${'='.repeat(70)}`);
            console.log(`🔍 [${doneCount + 1}/${total}] Analyzing: ${symbol}`);
            console.log(`   Remaining in cycle: ${remaining.length}`);
            console.log(`   Time: ${new Date().toISOString()}`);
            console.log(`${'='.repeat(70)}`);

            // ── call the API ──────────────────────────────────────────────────
            const port = process.env.PORT || 3005;
            const encodedSymbol = encodeURIComponent(symbol);
            const response = await axios.get(`http://localhost:${port}/api/check-symbol/${encodedSymbol}`, { timeout: 90000 });

            if (response.data && response.data.network && response.data.contractAddress) {
                console.log(`   📊 Network: ${response.data.network}  Contract: ${response.data.contractAddress}`);

                const holderAnalysis = await holderConcentrationService.analyzeHolderConcentration({
                    network: response.data.network,
                    address: response.data.contractAddress,
                    symbol
                });

                if (holderAnalysis.success) {
                    const hc = holderAnalysis.holderConcentration;
                    response.data.holderConcentration = {
                        top1Percentage:    typeof hc.top1Percentage  === 'number' ? hc.top1Percentage  : 0,
                        top1Address:       hc.top1Address  || null,
                        top1Label:         hc.top1Label    || null,
                        top1IsExchange:    hc.top1IsExchange  || false,
                        top1IsBlackhole:   hc.top1IsBlackhole || false,
                        top10Percentage:   typeof hc.top10Percentage === 'number' ? hc.top10Percentage : 0,
                        concentrationLevel: hc.concentrationLevel || 'UNKNOWN',
                        rugPullRisk:       hc.rugPullRisk  || false,
                        top10Holders:      Array.isArray(hc.top10Holders) ? hc.top10Holders : [],
                        blackholePercentage: typeof hc.blackholePercentage === 'number' ? hc.blackholePercentage : 0,
                        blackholeCount:    typeof hc.blackholeCount === 'number' ? hc.blackholeCount : 0,
                        holdersBreakdown:  hc.holdersBreakdown || {},
                        analysisMethod:    holderAnalysis.method
                    };
                    console.log(`   ✅ Holders — Top1: ${hc.top1Percentage}%  Top10: ${hc.top10Percentage}%  Level: ${hc.concentrationLevel}`);
                } else {
                    console.log(`   ⚠️  Holder service failed: ${holderAnalysis.error} — trying legacy fallback`);
                    try {
                        const old = await blockchainService.getHolderConcentration(symbol, response.data.network, response.data.contractAddress);
                        if (old && old.success) {
                            response.data.holderConcentration = { ...old, analysisMethod: 'Legacy' };
                        }
                    } catch (fe) {
                        console.error(`   ❌ Legacy fallback failed: ${fe.message}`);
                    }
                }
            } else {
                console.log(`   ⚠️  No network/contract info — skipping holder analysis`);
            }

            // ── save immediately after each token ────────────────────────────
            if (response.data && response.data.success === true) {
                const compact = this.createCompactAnalysis(symbol, response.data);
                await mongoService.saveToken(symbol.toUpperCase(), compact, Date.now());
                console.log(`   💾 Saved ${symbol} to MongoDB`);
            } else if (response.data && response.data.isNativeToken) {
                // Save native tokens with minimal risk data so they count in DB
                const nativeCompact = {
                    success: true,
                    symbol: symbol.toUpperCase(),
                    isNativeToken: true,
                    chainsFound: 0,
                    globalSpamScore: 0,
                    riskPercentage: 10,
                    shouldSkip: false,
                    AIRiskScore: null,
                    holderConcentration: {
                        top1Percentage: 0, top1Address: null, top1Label: null,
                        top1IsExchange: false, top1IsBlackhole: false,
                        top10Percentage: 0, concentrationLevel: 'UNKNOWN', rugPullRisk: false
                    }
                };
                await mongoService.saveToken(symbol.toUpperCase(), nativeCompact, Date.now());
                console.log(`   💾 Saved native token ${symbol} to MongoDB`);
            } else if (response.data && response.data.noContractFound && response.data.marketData) {
                // No contract but has market data — save as partial
                const partialData = {
                  success: true,
                  symbol: symbol.toUpperCase(),
                  isNativeToken: false,
                  noContractFound: true,
                  chainsFound: 0,
                  globalSpamScore: response.data.globalSpamScore || 25,
                  riskPercentage: response.data.gapHunterBotRisk?.riskPercentage ?? 40,
                  shouldSkip: response.data.gapHunterBotRisk?.shouldSkip ?? false,
                  AIRiskScore: null,
                  holderConcentration: {
                    top1Percentage: 0, top1Address: null, top1Label: null,
                    top1IsExchange: false, top1IsBlackhole: false,
                    top10Percentage: 0, concentrationLevel: 'UNKNOWN', rugPullRisk: false
                  }
                };
                await mongoService.saveToken(symbol.toUpperCase(), partialData, Date.now());
                console.log(`   💾 Saved ${symbol} to MongoDB (no-contract partial data)`);
            } else {
                console.log(`   ⚠️  API returned success=false for ${symbol} — not saved`);
            }

            // ── mark as done ─────────────────────────────────────────────────
            progress.analyzedTokens.push(symbol.toUpperCase());
            progress.lastUpdate = new Date().toISOString();
            await this.saveProgress(progress);
            console.log(`✅ Done: ${symbol}  (${progress.analyzedTokens.length}/${total} this cycle)`);

        } catch (err) {
            console.error(`❌ analyzeNextToken error:`, err.message);
        } finally {
            this.isRunning = false;
        }
    }

    createCompactAnalysis(symbol, fullData) {
        const hc = fullData.holderConcentration;
        const isTop1Blackhole = hc && (hc.top1IsBlackhole || false);
        
        let adjustedRiskPercentage = fullData.gapHunterBotRisk?.riskPercentage || 0;
        
        if (isTop1Blackhole && hc && hc.top1Percentage) {
            adjustedRiskPercentage = Math.max(0, adjustedRiskPercentage - hc.top1Percentage);
        }
        
        const compact = {
            success: fullData.success || false,
            symbol: symbol.toUpperCase(),
            isNativeToken: fullData.isNativeToken || false,
            chainsFound: fullData.chainsFound || 0,
            globalSpamScore: fullData.globalSpamScore || fullData.spamScore || 0,
            riskPercentage: adjustedRiskPercentage,
            shouldSkip: fullData.gapHunterBotRisk?.shouldSkip || false,
            AIRiskScore: fullData.gapHunterBotRisk?.AIriskScore?.score || fullData.gapHunterBotRisk?.AIRiskScore || null,
            holderConcentration: hc ? {
                top1Percentage: hc.top1Percentage || 0,
                top1Address: hc.top1Address || null,
                top1Label: hc.top1Label || null,
                top1IsExchange: hc.top1IsExchange || false,
                top1IsBlackhole: isTop1Blackhole,
                top10Percentage: hc.top10Percentage || 0,
                concentrationLevel: hc.concentrationLevel || null,
                rugPullRisk: hc.rugPullRisk || false
            } : {
                top1Percentage: 0,
                top1Address: null,
                top1Label: null,
                top1IsExchange: false,
                top1IsBlackhole: false,
                top10Percentage: 0,
                concentrationLevel: null,
                rugPullRisk: false
            }
        };

        return compact;
    }

    start() {
        // Run first token 15s after boot
        // setTimeout(() => this.analyzeNextToken(), 15000);

        // Every 5 minutes: analyze ONE token (increased interval to avoid browser/rate-limit congestion)
        cron.schedule('*/5 * * * *', () => {
            console.log('⏰ Cron tick — analyzing next token...');
            this.analyzeNextToken();
        }, { timezone: 'Africa/Tunis' });

        console.log('✅ Cron service started — one token every 3 minutes (Africa/Tunis)');
    }
}

module.exports = new CronService();