// test-kda.js - Standalone test script for KDA token analysis
const axios = require('axios');
const multiChainAnalyzer = require('./services/multiChainAnalyzer');
const categorizer = require('./services/categorizer');
const fs = require('fs');
const path = require('path');

class StandaloneTestRunner {
    constructor() {
        // this.testSymbols = ["CRO","FTT",'KDA', 'BTC', 'ETH'];
        this.testSymbols = ["CRO"];
        this.results = [];
    }

    async analyzeSymbol(symbol, index, total) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${index + 1}/${total}] Analyzing ${symbol}...`);
        console.log('='.repeat(60));
        
        try {
            const startTime = Date.now();
            
            // Call multiChainAnalyzer directly without server
            const data = await multiChainAnalyzer.analyzeBySymbol(symbol);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            console.log(`\n✅ Analysis completed in ${duration}s`);
            
            console.log(`\n📊 Summary for ${symbol}:`);
            console.log(`   Symbol: ${data.symbol || symbol}`);
            console.log(`   Is Native Token: ${data.isNativeToken ? 'Yes' : 'No'}`);
            console.log(`   Chains Found: ${data.chainsFound || data.chains?.length || 0}`);
            
            if (data.marketData) {
                console.log(`\n   💰 Market Data:`);
                console.log(`      Market Cap: $${data.marketData.marketCap || 'N/A'}`);
                console.log(`      24h Volume: $${data.marketData.volume24h || 'N/A'}`);
                console.log(`      Current Price: $${data.marketData.currentPrice || 'N/A'}`);
                console.log(`      24h Change: ${data.marketData.priceChange24h || 'N/A'}`);
                console.log(`      Volume/MCap Ratio: ${data.marketData.volumeToMarketCapPercentage || 'N/A'}`);
                
                if (data.marketData.circulatingSupply) {
                    console.log(`      Circulating Supply: ${data.marketData.circulatingSupply}`);
                }
                if (data.marketData.totalSupply) {
                    console.log(`      Total Supply: ${data.marketData.totalSupply}`);
                }
                if (data.marketData.marketCapRank) {
                    console.log(`      CMC Rank: #${data.marketData.marketCapRank}`);
                }
            }
            
            if (data.gapHunterBotRisk) {
                console.log(`\n   ⚠️  Gap Hunter Risk:`);
                console.log(`      Risk %: ${data.gapHunterBotRisk.riskPercentage}%`);
                console.log(`      Should Skip: ${data.gapHunterBotRisk.shouldSkip ? 'Yes' : 'No'}`);
                console.log(`      Hard Skip: ${data.gapHunterBotRisk.hardSkip ? 'Yes' : 'No'}`);
                console.log(`      Recommendation: ${data.gapHunterBotRisk.recommendation}`);
                
                if (data.gapHunterBotRisk.AIriskScore) {
                    console.log(`\n      🤖 AI Risk Score:`);
                    console.log(`         Score: ${data.gapHunterBotRisk.AIriskScore.score}/100`);
                    console.log(`         Verdict: ${data.gapHunterBotRisk.AIriskScore.verdict}`);
                    console.log(`         Confidence: ${data.gapHunterBotRisk.AIriskScore.confidence}`);
                    console.log(`         Recommendation: ${data.gapHunterBotRisk.AIriskScore.recommendation}`);
                }
            }
            
            if (data.blockchainDetails) {
                console.log(`\n   ⛓️  Blockchain Details:`);
                if (data.blockchainDetails.blockchainStats) {
                    const stats = data.blockchainDetails.blockchainStats;
                    console.log(`      Current Block: ${stats.currentBlockHeight || 'N/A'}`);
                    console.log(`      Total Transactions: ${stats.totalTransactions || 'N/A'}`);
                    console.log(`      Active Addresses: ${stats.activeAddresses || 'N/A'}`);
                    console.log(`      Avg Block Time: ${stats.averageBlockTime || 'N/A'}s`);
                    if (stats.hashRate) console.log(`      Hash Rate: ${stats.hashRate}`);
                    if (stats.difficulty) console.log(`      Difficulty: ${stats.difficulty}`);
                }
                if (data.blockchainDetails.networkHealth) {
                    console.log(`      Network Status: ${data.blockchainDetails.networkHealth.status || 'N/A'}`);
                    if (data.blockchainDetails.networkHealth.nodeCount) {
                        console.log(`      Nodes: ${data.blockchainDetails.networkHealth.nodeCount}`);
                    }
                }
                if (data.blockchainDetails.recentActivity) {
                    const activity = data.blockchainDetails.recentActivity;
                    if (activity.transactionsPerSecond) {
                        console.log(`      TPS: ${activity.transactionsPerSecond}`);
                    }
                }
            }
            
            if (data.holderConcentration) {
                console.log(`\n   👥 Holder Concentration:`);
                console.log(`      Top 1: ${data.holderConcentration.top1Percentage}%`);
                console.log(`      Top 10: ${data.holderConcentration.top10Percentage}%`);
                console.log(`      Level: ${data.holderConcentration.concentrationLevel}`);
                console.log(`      Rug Pull Risk: ${data.holderConcentration.rugPullRisk ? 'Yes' : 'No'}`);
            }
            
            if (data.exchanges && data.exchanges.length > 0) {
                console.log(`\n   🏦 Exchanges (${data.exchanges.length}):`);
                console.log(`      ${data.exchanges.slice(0, 10).join(', ')}${data.exchanges.length > 10 ? '...' : ''}`);
            }
            
            if (data.aiEnhancedData) {
                console.log(`\n   🤖 AI Enhanced Data:`);
                if (data.aiEnhancedData.description) {
                    console.log(`      Description: ${data.aiEnhancedData.description.substring(0, 150)}...`);
                }
                if (data.aiEnhancedData.launchDate) {
                    console.log(`      Launch Date: ${data.aiEnhancedData.launchDate}`);
                }
                if (data.aiEnhancedData.consensusMechanism) {
                    console.log(`      Consensus: ${data.aiEnhancedData.consensusMechanism}`);
                }
                if (data.aiEnhancedData.blockTime) {
                    console.log(`      Block Time: ${data.aiEnhancedData.blockTime}`);
                }
            }
            
            if (data.dataSources) {
                console.log(`\n   📡 Data Sources:`);
                console.log(`      CoinGecko: ${data.dataSources.coinGecko ? '✅' : '❌'}`);
                console.log(`      CoinMarketCap: ${data.dataSources.coinMarketCap ? '✅' : '❌'}`);
                console.log(`      Blockchain: ${data.dataSources.blockchain ? '✅' : '❌'}`);
                console.log(`      AI Enhanced: ${data.dataSources.ai ? '✅' : '❌'}`);
            }
            
            if (data.explorer) {
                console.log(`\n   🔍 Explorer: ${data.explorer}`);
            }
            
            // Save individual result
            const outputDir = path.join(__dirname, 'test-results');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            fs.writeFileSync(
                path.join(outputDir, `${symbol.toLowerCase()}-analysis.json`),
                JSON.stringify(data, null, 2)
            );
            console.log(`\n   💾 Saved to: test-results/${symbol.toLowerCase()}-analysis.json`);
            
            this.results.push({
                symbol,
                success: true,
                duration,
                data
            });
            
        } catch (err) {
            console.error(`\n❌ Error analyzing ${symbol}:`, err.message);
            console.error(`   Stack: ${err.stack}`);
            this.results.push({
                symbol,
                success: false,
                error: err.message,
                stack: err.stack
            });
        }
    }

    async run() {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  KDA Token Analysis Test - Standalone (No Server Needed)  ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        
        console.log(`📋 Testing ${this.testSymbols.length} symbols: ${this.testSymbols.join(', ')}`);
        console.log(`⏰ Using 15s delay between requests (rate limit protection)\n`);
        
        const delayBetweenRequests = 15000;
        
        for (let i = 0; i < this.testSymbols.length; i++) {
            await this.analyzeSymbol(this.testSymbols[i], i, this.testSymbols.length);
            
            if (i < this.testSymbols.length - 1) {
                console.log(`\n⏳ Waiting ${delayBetweenRequests/1000}s before next request to avoid rate limits...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
        }
        
        console.log(`\n\n${'='.repeat(60)}`);
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        
        const successful = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        
        console.log(`\n✅ Successful: ${successful}/${this.testSymbols.length}`);
        console.log(`❌ Failed: ${failed}/${this.testSymbols.length}`);
        
        if (successful > 0) {
            console.log(`\n✨ Successful Symbols:`);
            this.results.filter(r => r.success).forEach(r => {
                console.log(`   ✓ ${r.symbol} (${r.duration}s)`);
                if (r.data.isNativeToken) {
                    console.log(`     → Native blockchain token`);
                }
                if (r.data.marketData?.marketCap) {
                    console.log(`     → Market Cap: $${r.data.marketData.marketCap}`);
                }
            });
        }
        
        if (failed > 0) {
            console.log(`\n⚠️  Failed Symbols:`);
            this.results.filter(r => !r.success).forEach(r => {
                console.log(`   ✗ ${r.symbol}: ${r.error}`);
            });
        }
        
        console.log(`\n💾 Saving summary to test-results/test-summary.json...`);
        const outputDir = path.join(__dirname, 'test-results');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(outputDir, 'test-summary.json'),
            JSON.stringify({
                testDate: new Date().toISOString(),
                totalSymbols: this.testSymbols.length,
                successful,
                failed,
                results: this.results
            }, null, 2)
        );
        
        console.log(`✅ Summary saved!`);
        
        // Optionally run categorization
        if (successful > 0) {
            console.log(`\n📊 Running categorization...`);
            try {
                await categorizer.categorizeSymbols();
                console.log(`✅ Categorization complete`);
            } catch (err) {
                console.log(`⚠️  Categorization skipped: ${err.message}`);
            }
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log('✨ Test Complete!');
        console.log('='.repeat(60));
        console.log(`\n📁 Results saved in: test-results/`);
        console.log(`   - test-summary.json (overall summary)`);
        this.results.filter(r => r.success).forEach(r => {
            console.log(`   - ${r.symbol.toLowerCase()}-analysis.json`);
        });
        console.log('');
    }
}

const runner = new StandaloneTestRunner();
runner.run().then(() => {
    console.log('✅ All tests completed successfully');
    process.exit(0);
}).catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
});