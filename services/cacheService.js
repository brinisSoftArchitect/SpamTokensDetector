// services/cacheService.js
const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

class CacheService {
    constructor() {
        this.cache = new Map();
        this.cacheDir = path.join(__dirname, '../cache');
        this.cacheFile = path.join(this.cacheDir, 'symbol-analysis.json');
        this.categoriesFile = path.join(this.cacheDir, 'categories.json');
        this.mongoClient = null;
        this.db = null;
        this.collection = null;
        this.initCache();
        this.initMongo();
    }

    async initMongo() {
        try {
            const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
            const dbName = process.env.MONGO_DB || 'spamTokenDetector';
            
            this.mongoClient = new MongoClient(mongoUri);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(dbName);
            this.collection = this.db.collection('tokenAnalysis');
            
            await this.collection.createIndex({ symbol: 1 }, { unique: true });
            await this.collection.createIndex({ timestamp: 1 });
            
            console.log('✅ MongoDB connected successfully');
        } catch (err) {
            console.error('❌ MongoDB connection failed:', err.message);
            console.log('⚠️  Continuing without MongoDB support');
        }
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

        let cached = this.cache.get(key);
        
        if (!cached && this.collection) {
            const mongoData = await this.getFromMongo(key);
            if (mongoData) {
                cached = {
                    data: mongoData,
                    timestamp: mongoData.timestamp
                };
                this.cache.set(key, cached);
                console.log(`📥 Loaded ${key} from MongoDB to memory cache`);
            }
        }
        
        if (!cached) return null;

        const cacheTime = parseInt(process.env.CACHE_TIME_HOURS || '4');
        const expiryTime = cacheTime * 60 * 60 * 1000;
        
        if (Date.now() - cached.timestamp > expiryTime) {
            this.cache.delete(key);
            if (this.collection) {
                await this.collection.deleteOne({ symbol: key });
            }
            return null;
        }

        return cached.data;
    }

    async set(key, data) {
        const reducedData = this.reduceAnalysisData(data);
        const timestamp = Date.now();
        
        this.cache.set(key, {
            data: reducedData,
            timestamp: timestamp
        });
        
        await Promise.all([
            this.persist(),
            this.saveToMongo(key, reducedData, timestamp)
        ]);
    }

    async saveToMongo(symbol, data, timestamp) {
        if (!this.collection) {
            console.log('⚠️  MongoDB not available, skipping save');
            return;
        }

        try {
            await this.collection.updateOne(
                { symbol: symbol },
                { 
                    $set: { 
                        ...data,
                        symbol: symbol,
                        timestamp: timestamp,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            console.log(`💾 Saved ${symbol} to MongoDB`);
        } catch (err) {
            console.error(`❌ MongoDB save failed for ${symbol}:`, err.message);
        }
    }

    async getFromMongo(symbol) {
        if (!this.collection) return null;

        try {
            const result = await this.collection.findOne({ symbol: symbol });
            if (!result) return null;

            const cacheTime = parseInt(process.env.CACHE_TIME_HOURS || '4');
            const expiryTime = cacheTime * 60 * 60 * 1000;
            
            if (Date.now() - result.timestamp > expiryTime) {
                await this.collection.deleteOne({ symbol: symbol });
                return null;
            }

            return result;
        } catch (err) {
            console.error(`❌ MongoDB get failed for ${symbol}:`, err.message);
            return null;
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

    async getAllFromMongo(limit = 100) {
        if (!this.collection) return [];

        try {
            const results = await this.collection
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
            return results;
        } catch (err) {
            console.error('❌ MongoDB getAllFromMongo failed:', err.message);
            return [];
        }
    }

    async closeConnections() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('✅ MongoDB connection closed');
        }
    }
}

module.exports = new CacheService();