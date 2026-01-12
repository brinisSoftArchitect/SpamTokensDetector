// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const categorizer = require('./categorizer');
const gateioService = require('./gateioService');

class CronService {
    constructor() {
        this.symbols = [];
        this.isRunning = false;
        this.useGateioTokens = process.env.USE_GATEIO_TOKENS === 'true';
        this.maxTokensToAnalyze = parseInt(process.env.MAX_TOKENS_TO_ANALYZE || '100');
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

            let analyzed = 0;
            let failed = 0;
            
            // Calculate delay to stay under rate limits (15 requests per minute = 4 seconds between requests)
            const delayBetweenRequests = 15000; // 15 seconds to be safe
            
            for (const symbol of this.symbols) {
                try {
                    console.log(`[${analyzed + 1}/${this.symbols.length}] Analyzing ${symbol}...`);
                    const response = await axios.get(`http://localhost:${process.env.PORT || 3005}/api/check-symbol/${symbol}`);
                    analyzed++;
                    
                    // Wait before next request to avoid rate limits
                    if (analyzed < this.symbols.length) {
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
            await categorizer.categorizeSymbols();
            console.log('Symbol analysis and categorization completed');
        } catch (err) {
            console.error('Error in symbol analysis:', err);
        } finally {
            this.isRunning = false;
        }
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