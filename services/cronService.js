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
            if (process.env.MONGO) {
                await mongoose.connect(process.env.MONGO);
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
            const symbolAnalysisPath = path.join(__dirname, '../cache/symbol-analysis.json');
            let existingAnalysis = {};
            try {
                const data = await fs.readFile(symbolAnalysisPath, 'utf8');
                existingAnalysis = JSON.parse(data);
                console.log(`📂 Loaded existing analysis for ${Object.keys(existingAnalysis).length} tokens`);
            } catch (err) {
                console.log('📝 No existing analysis found, starting fresh');
            }

            // Prioritize: undefined/missing first, then incomplete
            const symbolsToAnalyze = [];
            const undefinedSymbols = [];
            const incompleteSymbols = [];
            const completeSymbols = [];

            for (const symbol of this.symbols) {
                const analysis = existingAnalysis[symbol];
                if (!analysis || analysis === undefined) {
                    undefinedSymbols.push(symbol);
                } else if (!analysis.globalSpamScore || !analysis.overallRisk || !analysis.networks) {
                    incompleteSymbols.push(symbol);
                } else {
                    completeSymbols.push(symbol);
                }
            }

            symbolsToAnalyze.push(...undefinedSymbols, ...incompleteSymbols, ...completeSymbols);
            console.log(`📊 Analysis Priority:`);
            console.log(`   - Undefined/Missing: ${undefinedSymbols.length}`);
            console.log(`   - Incomplete: ${incompleteSymbols.length}`);
            console.log(`   - Complete (will refresh): ${completeSymbols.length}`);

            this.symbols = symbolsToAnalyze;
            let analyzed = 0;
            let failed = 0;
            
            // Create cache/tokens directory if it doesn't exist
            const cacheDir = path.join(__dirname, '../cache/tokens');
            try {
                await fs.mkdir(cacheDir, { recursive: true });
                console.log(`✅ Cache directory ready: ${cacheDir}`);
            } catch (err) {
                console.error('Error creating cache directory:', err);
            }
            
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
                            
                            // Enhance response with detailed holder data
                            response.data.holderConcentration = {
                                top1Percentage: holderAnalysis.holderConcentration.top1Percentage,
                                top1Address: holderAnalysis.holderConcentration.top1Address,
                                top1Label: holderAnalysis.holderConcentration.top1Label,
                                top10Percentage: holderAnalysis.holderConcentration.top10Percentage,
                                concentrationLevel: holderAnalysis.holderConcentration.concentrationLevel,
                                rugPullRisk: holderAnalysis.holderConcentration.rugPullRisk,
                                top10Holders: holderAnalysis.holderConcentration.top10Holders,
                                blackholePercentage: holderAnalysis.holderConcentration.blackholePercentage,
                                blackholeCount: holderAnalysis.holderConcentration.blackholeCount,
                                holdersBreakdown: holderAnalysis.holderConcentration.holdersBreakdown,
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
                        existingAnalysis[symbol] = compactData;
                        console.log(`✅ Analyzed ${symbol} (will save at end)`);
                        analyzed++;
                    } else {
                        console.log(`⚠️ Skipped saving ${symbol} - success is not true`);
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
            
            // Save symbol-analysis.json ONCE at the end
            console.log(`\n💾 Saving symbol-analysis.json with ${Object.keys(existingAnalysis).length} tokens...`);
            await fs.writeFile(symbolAnalysisPath, JSON.stringify(existingAnalysis, null, 2));
            console.log(`✅ Saved symbol-analysis.json successfully`);
            
            // Save to MongoDB if connected
            if (this.mongoConnected) {
                console.log(`\n💾 Saving ${Object.keys(existingAnalysis).length} tokens to MongoDB...`);
                let mongoSaved = 0;
                let mongoFailed = 0;
                
                for (const [symbol, data] of Object.entries(existingAnalysis)) {
                    try {
                        await TokenAnalysis.findOneAndUpdate(
                            { symbol: symbol },
                            { ...data, lastUpdated: new Date() },
                            { upsert: true, new: true }
                        );
                        mongoSaved++;
                    } catch (err) {
                        console.error(`❌ Failed to save ${symbol} to MongoDB:`, err.message);
                        mongoFailed++;
                    }
                }
                
                console.log(`✅ MongoDB: ${mongoSaved} saved, ${mongoFailed} failed`);
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
        const compact = {
            symbol: symbol,
            globalSpamScore: fullData.spamScore || 0,
            overallRisk: fullData.riskLevel || 'UNKNOWN',
            isSpamGlobally: fullData.isSpam || false,
            gapHunterBotRisk: {
                riskPercentage: fullData.gapHunterBotRisk?.riskPercentage || 0,
                shouldSkip: fullData.gapHunterBotRisk?.shouldSkip || false,
                hardSkip: fullData.gapHunterBotRisk?.hardSkip || false
            }
        };

        // Add network-specific data if available (only essential info, NO holders list)
        // if (fullData.token?.network && fullData.token?.contractAddress) {
        //     const network = fullData.token.network;
            
        //     compact.networks = {
        //         [network]: {
        //             address: fullData.token.contractAddress,
        //             top10Percentage: parseFloat((fullData.holderConcentration?.top10Percentage || 0).toFixed(2))
        //         }
        //     };
        // }

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