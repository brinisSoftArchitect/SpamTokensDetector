// services/cacheService.js
const fs = require('fs').promises;
const path = require('path');
const mongoService = require('./mongoService');

class CacheService {
    constructor() {
        this.cache = new Map();
        this.cacheDir = path.join(__dirname, '../cache');
        this.cacheFile = path.join(this.cacheDir, 'symbol-analysis.json');
        this.categoriesFile = path.join(this.cacheDir, 'categories.json');
        this.initCache();
    }

    async initCache() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            
            try {
                const data = await fs.readFile(this.cacheFile, 'utf8');
                const parsed = JSON.parse(data);
                this.cache = new Map(Object.entries(parsed));
            } catch (err) {
                console.log('No existing cache found, starting fresh');
            }
        } catch (err) {
            console.error('Error initializing cache:', err);
        }
    }

    async get(key) {
        const cacheEnabled = process.env.CACHE !== 'false';
        if (!cacheEnabled) return null;

        // Priority 1: Check memory cache
        let cached = this.cache.get(key);
        
        // Priority 2: Check MongoDB (primary source) - optional, don't fail if unavailable
        if (!cached) {
            try {
                const mongoData = await mongoService.getToken(key);
                if (mongoData) {
                    cached = {
                        data: mongoData,
                        timestamp: mongoData.timestamp
                    };
                    this.cache.set(key, cached);
                    console.log(`📥 Loaded ${key} from MongoDB to memory cache`);
                }
            } catch (err) {
                // MongoDB unavailable, continue without it
            }
        }
        
        if (!cached) return null;

        const cacheTime = parseInt(process.env.CACHE_TIME_HOURS || '4');
        const expiryTime = cacheTime * 60 * 60 * 1000;
        
        if (Date.now() - cached.timestamp > expiryTime) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    async set(key, data) {
        const reducedData = this.reduceAnalysisData(data);
        const timestamp = Date.now();
        
        // Save to memory cache (always succeeds)
        this.cache.set(key, {
            data: reducedData,
            timestamp: timestamp
        });
        
        // Save to MongoDB (primary) and file (backup) - non-blocking, don't throw errors
        try {
            await Promise.allSettled([
                mongoService.saveToken(key, reducedData, timestamp),
                this.persist()
            ]);
        } catch (err) {
            console.log(`⚠️  Cache persistence failed (non-critical): ${err.message}`);
        }
    }

    reduceAnalysisData(data) {
        if (!data || typeof data !== 'object') return data;

        const reduced = {
            success: data.success,
            symbol: data.symbol,
            isNativeToken: data.isNativeToken,
            chainsFound: data.chainsFound,
            globalSpamScore: data.globalSpamScore,
            riskPercentage: data.gapHunterBotRisk?.riskPercentage,
            shouldSkip: data.gapHunterBotRisk?.shouldSkip,
            AIRiskScore: data.gapHunterBotRisk?.AIriskScore?.score || data.gapHunterBotRisk?.AIRiskScore,
            holderConcentration: data.holderConcentration ? {
                top1Percentage: data.holderConcentration.top1Percentage,
                top1Address: data.holderConcentration.top1Address,
                top1Label: data.holderConcentration.top1Label,
                top1IsExchange: data.holderConcentration.top1IsExchange,
                top1IsBlackhole: data.holderConcentration.top1IsBlackhole,
                top10Percentage: data.holderConcentration.top10Percentage
            } : null
        };

        return reduced;
    }

    async persist() {
        try {
            const obj = Object.fromEntries(this.cache);
            await fs.writeFile(this.cacheFile, JSON.stringify(obj, null, 2));
        } catch (err) {
            console.error('Error persisting cache:', err);
        }
    }

    async saveCategories(categories) {
        try {
            await fs.writeFile(this.categoriesFile, JSON.stringify(categories, null, 2));
        } catch (err) {
            console.error('Error saving categories:', err);
        }
    }

    async getCategories() {
        try {
            const data = await fs.readFile(this.categoriesFile, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            return { scam: [], canBuy: [] };
        }
    }

    getAllCached() {
        const result = {};
        for (const [key, value] of this.cache.entries()) {
            result[key] = value.data;
        }
        return result;
    }

    async closeConnections() {
        await mongoService.close();
    }
}

module.exports = new CacheService();