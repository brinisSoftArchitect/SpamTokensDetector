// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const categorizer = require('./categorizer');
const gateioService = require('./gateioService');
const holderConcentrationService = require('./holderConcentrationService');
const blockchainService = require('./blockchainService');
const fs = require('fs').promises;
const path = require('path');
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

    async analyzeAllSymbols() {
        if (this.isRunning) {
            console.log('Analysis already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('Starting symbol analysis...');

        try {
            if (this.useGateioTokens) {
                console.log('Fetching all tokens from Gate.io...');
                const gateioTokens = await gateioService.getAllTokenSymbols();
                
                if (gateioTokens.length > 0) {
                    this.symbols = gateioTokens.slice(0, this.maxTokensToAnalyze);
                    console.log(`Analyzing ${this.symbols.length} tokens from Gate.io (limited to ${this.maxTokensToAnalyze})`);
                } else {
                    console.log('Failed to fetch Gate.io tokens, using default list');
                    const symbolList = process.env.SYMBOLS_TO_ANALYZE || 'BTC,ETH,USDT,BNB,SOL,XRP,DOGE,ADA,AVAX,MATIC';
                    this.symbols = symbolList.split(',').map(s => s.trim());
                }
            } else {
                const symbolList = process.env.SYMBOLS_TO_ANALYZE || 'BTC,ETH,USDT,BNB,SOL,XRP,DOGE,ADA,AVAX,MATIC';
                this.symbols = symbolList.split(',').map(s => s.trim());
            }

            // Load existing analysis and prioritize
            // Load existing analysis from MongoDB (primary source)
            const mongoService = require('./mongoService');
            let existingAnalysis = {};
            let mongoTokenCount = 0;
            
            try {
                console.log('🔍 Loading existing analysis from MongoDB...');
                const allTokens = await mongoService.getAllTokens({ limit: 10000 });
                
                allTokens.forEach(token => {
                    existingAnalysis[token.symbol] = {
                        data: token,
                        timestamp: token.timestamp
                    };
                });
                
                mongoTokenCount = allTokens.length;
                console.log(`✅ Loaded ${mongoTokenCount} tokens from MongoDB`);
            } catch (err) {
                console.log('⚠️  MongoDB load failed, trying file cache...');
                
                // Fallback to file cache if MongoDB fails
                const symbolAnalysisPath = path.join(__dirname, '../cache/symbol-analysis.json');
                try {
                    const data = await fs.readFile(symbolAnalysisPath, 'utf8');
                    const fileData = JSON.parse(data);
                    existingAnalysis = fileData;
                    console.log(`📂 Loaded ${Object.keys(existingAnalysis).length} tokens from file cache`);
                } catch (fileErr) {
                    console.log('📝 No existing analysis found, starting fresh');
                }
            }

            // Prioritize: missing first (not in DB), then incomplete, then complete
            const allSymbols = this.symbols;
            const missingSymbols = [];
            const incompleteSymbols = [];
            const completeSymbols = [];

            console.log(`\n🔍 Checking ${allSymbols.length} symbols against database...\n`);

            for (const symbol of allSymbols) {
                const upperSymbol = symbol.toUpperCase();
                const analysis = existingAnalysis[upperSymbol];
                
                if (!analysis) {
                    // Symbol not in database at all - highest priority
                    missingSymbols.push(symbol);
                    // console.log(`   ❌ ${symbol}: Not in database (MISSING)`);
                } else {
                    const data = analysis.data || analysis;
                    const hasRiskData = data.riskPercentage !== undefined && 
                                       data.riskPercentage !== null && 
                                       !isNaN(data.riskPercentage);
                    
                    // Check holder data - must be an object with valid top10Percentage
                    const hasHolderData = data.holderConcentration && 
                                        typeof data.holderConcentration === 'object' &&
                                        data.holderConcentration !== null &&
                                        typeof data.holderConcentration.top10Percentage === 'number' &&
                                        !isNaN(data.holderConcentration.top10Percentage) &&
                                        data.holderConcentration.top10Percentage >= 0;
                    
                    if (!hasRiskData || !hasHolderData) {
                        // Has some data but missing critical fields
                        incompleteSymbols.push(symbol);
                        const missingParts = [];
                        if (!hasRiskData) missingParts.push('risk');
                        if (!hasHolderData) {
                            if (!data.holderConcentration || data.holderConcentration === null) {
                                missingParts.push('holder (null)');
                            } else {
                                missingParts.push('holder (invalid)');
                            }
                        }
                        // console.log(`   ⚠️  ${symbol}: Incomplete (missing ${missingParts.join(' & ')} data)`);
                    } else {
                        // Has all required data
                        completeSymbols.push(symbol);
                        // console.log(`   ✅ ${symbol}: Complete (risk: ${data.riskPercentage}%, top10: ${data.holderConcentration.top10Percentage}%)`);
                    }
                }
            }

            const symbolsToAnalyze = [...missingSymbols, ...incompleteSymbols, ...completeSymbols];
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📊 ANALYSIS PRIORITY SUMMARY`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Data Source: MongoDB (${mongoTokenCount} tokens loaded)`);
            console.log(`Total symbols to process: ${allSymbols.length}`);
            console.log(`  1️⃣  Missing (not in DB):    ${missingSymbols.length}`);
            console.log(`  2️⃣  Incomplete (partial):   ${incompleteSymbols.length}`);
            console.log(`  3️⃣  Complete (will refresh): ${completeSymbols.length}`);
            console.log(`${'='.repeat(80)}\n`);

            if (missingSymbols.length > 0) {
                console.log(`🎯 Priority tokens (missing): ${missingSymbols.slice(0, 10).join(', ')}${missingSymbols.length > 10 ? '...' : ''}`);
            }
            if (incompleteSymbols.length > 0) {
                console.log(`⚠️  Incomplete tokens: ${incompleteSymbols.slice(0, 10).join(', ')}${incompleteSymbols.length > 10 ? '...' : ''}`);
            }
            console.log('');

            this.symbols = symbolsToAnalyze;
            let analyzed = 0;
            let failed = 0;
            
            // Calculate delay to stay under rate limits (15 requests per minute = 4 seconds between requests)
            const delayBetweenRequests = 15000; // 15 seconds to be safe
            
            for (const symbol of this.symbols) {
                try {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log(`[${analyzed + 1}/${this.symbols.length}] Analyzing ${symbol}`);
                    console.log(`${'='.repeat(80)}`);
                    
                    // Get basic token info first
                    const response = await axios.get(`http://localhost:${process.env.PORT || 3005}/api/check-symbol/${symbol}`);
                    
                    // If we have network and address, enhance with holder concentration analysis
                    if (response.data && response.data.network && response.data.contractAddress) {
                        console.log(`   📊 Token found on ${response.data.network}`);
                        console.log(`   📍 Contract: ${response.data.contractAddress}`);
                        
                        // Try new holder concentration service first
                        console.log(`   🔍 Analyzing holder concentration with new service...`);
                        const holderAnalysis = await holderConcentrationService.analyzeHolderConcentration({
                            network: response.data.network,
                            address: response.data.contractAddress,
                            symbol: symbol
                        });
                        
                        if (holderAnalysis.success) {
                            console.log(`   ✅ Holder analysis completed (method: ${holderAnalysis.method})`);
                            
                            // Enhance response with detailed holder data - ensure all values are valid
                            const hc = holderAnalysis.holderConcentration;
                            response.data.holderConcentration = {
                                top1Percentage: typeof hc.top1Percentage === 'number' ? hc.top1Percentage : 0,
                                top1Address: hc.top1Address || null,
                                top1Label: hc.top1Label || null,
                                top1IsExchange: hc.top1IsExchange || false,
                                top1IsBlackhole: hc.top1IsBlackhole || false,
                                top10Percentage: typeof hc.top10Percentage === 'number' ? hc.top10Percentage : 0,
                                concentrationLevel: hc.concentrationLevel || 'UNKNOWN',
                                rugPullRisk: hc.rugPullRisk || false,
                                top10Holders: Array.isArray(hc.top10Holders) ? hc.top10Holders : [],
                                blackholePercentage: typeof hc.blackholePercentage === 'number' ? hc.blackholePercentage : 0,
                                blackholeCount: typeof hc.blackholeCount === 'number' ? hc.blackholeCount : 0,
                                holdersBreakdown: hc.holdersBreakdown || {},
                                analysisMethod: holderAnalysis.method
                            };
                            
                            // Log summary
                            console.log(`   📈 Top 1: ${holderAnalysis.holderConcentration.top1Percentage}% - ${holderAnalysis.holderConcentration.top1Label}`);
                            console.log(`   📊 Top 10: ${holderAnalysis.holderConcentration.top10Percentage}%`);
                            console.log(`   🎯 Risk Level: ${holderAnalysis.holderConcentration.concentrationLevel}`);
                        } else {
                            console.log(`   ⚠️ New holder service failed: ${holderAnalysis.error}`);
                            console.log(`   🔄 Falling back to old blockchain service...`);
                            
                            // Fallback to old method
                            try {
                                const oldHolderInfo = await blockchainService.getHolderConcentration(
                                    symbol,
                                    response.data.network,
                                    response.data.contractAddress
                                );
                                
                                if (oldHolderInfo && oldHolderInfo.success) {
                                    console.log(`   ✅ Old holder service succeeded`);
                                    response.data.holderConcentration = oldHolderInfo;
                                    response.data.holderConcentration.analysisMethod = 'Legacy';
                                } else {
                                    console.log(`   ❌ Both holder services failed`);
                                    response.data.holderConcentration = {
                                        success: false,
                                        error: 'All holder analysis methods failed',
                                        analysisMethod: 'Failed'
                                    };
                                }
                            } catch (fallbackError) {
                                console.error(`   ❌ Fallback error: ${fallbackError.message}`);
                                response.data.holderConcentration = {
                                    success: false,
                                    error: fallbackError.message,
                                    analysisMethod: 'Failed'
                                };
                            }
                        }
                    } else {
                        console.log(`   ⚠️ No network/contract info available for holder analysis`);
                    }
                    
                    // Store compact analysis in memory (don't save yet)
                    if (response.data && response.data.success === true) {
                        const compactData = this.createCompactAnalysis(symbol, response.data);
                        const upperSymbol = symbol.toUpperCase();
                        existingAnalysis[upperSymbol] = {
                            data: compactData,
                            timestamp: Date.now()
                        };
                        console.log(`✅ Analyzed ${symbol} (queued for save)`);
                        analyzed++;
                    } else {
                        console.log(`⚠️ Skipped ${symbol} - API returned success=false`);
                        failed++;
                    }
                    
                    // Wait before next request to avoid rate limits
                    if ((analyzed + failed) < this.symbols.length) {
                        console.log(`⏳ Waiting ${delayBetweenRequests/1000}s before next request to avoid rate limits...`);
                        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
                    }
                } catch (err) {
                    console.error(`Error analyzing ${symbol}:`, err.message);
                    failed++;
                    // Still wait on error to maintain rate limit
                    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
                }
            }

            console.log(`\nAnalysis Summary: ${analyzed} successful, ${failed} failed`);
            
            // Save to MongoDB first (primary), then file (backup)
            console.log(`\n💾 Saving analysis results...`);
            
            // Priority 1: Save to MongoDB
            let mongoSaved = 0;
            let mongoFailed = 0;
            
            for (const [symbol, compactData] of Object.entries(existingAnalysis)) {
                try {
                    const upperSymbol = symbol.toUpperCase();
                    const dataToSave = compactData.data || compactData;
                    
                    await mongoService.saveToken(upperSymbol, dataToSave, compactData.timestamp || Date.now());
                    mongoSaved++;
                } catch (err) {
                    console.error(`❌ Failed to save ${symbol} to MongoDB:`, err.message);
                    mongoFailed++;
                }
            }
            
            console.log(`   ✅ MongoDB: ${mongoSaved} saved, ${mongoFailed} failed`);
            
            // Priority 2: Save to file as backup
            const symbolAnalysisPath = path.join(__dirname, '../cache/symbol-analysis.json');
            try {
                await fs.writeFile(symbolAnalysisPath, JSON.stringify(existingAnalysis, null, 2));
                console.log(`   ✅ File cache: symbol-analysis.json saved (${Object.keys(existingAnalysis).length} tokens)`);
            } catch (err) {
                console.error(`   ❌ Failed to save file cache:`, err.message);
            }
            
            await categorizer.categorizeSymbols();
            console.log('Symbol analysis and categorization completed');
        } catch (err) {
            console.error('Error in symbol analysis:', err);
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
        setTimeout(() => this.analyzeAllSymbols(), 5000);

        cron.schedule('0 0 * * *', () => {
            console.log('Running scheduled symbol analysis...');
            this.analyzeAllSymbols();
        });

        console.log('Cron service started - will analyze symbols daily at midnight');
    }
}

module.exports = new CronService();