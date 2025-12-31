// services/cronService.js
const cron = require('node-cron');
const axios = require('axios');
const categorizer = require('./categorizer');

class CronService {
    constructor() {
        this.symbols = [];
        this.isRunning = false;
    }

    async analyzeAllSymbols() {
        if (this.isRunning) {
            console.log('Analysis already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('Starting symbol analysis...');

        try {
            const symbolList = process.env.SYMBOLS_TO_ANALYZE || 'BTC,ETH,USDT,BNB,SOL,XRP,DOGE,ADA,AVAX,MATIC';
            this.symbols = symbolList.split(',').map(s => s.trim());

            for (const symbol of this.symbols) {
                try {
                    console.log(`Analyzing ${symbol}...`);
                    const response = await axios.get(`http://localhost:${process.env.PORT || 3005}/api/check-symbol/${symbol}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (err) {
                    console.error(`Error analyzing ${symbol}:`, err.message);
                }
            }

            await categorizer.categorizeSymbols();
            console.log('Symbol analysis completed');
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