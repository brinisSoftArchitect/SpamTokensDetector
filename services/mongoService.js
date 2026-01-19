// services/mongoService.js - MongoDB service for token management
const { MongoClient } = require('mongodb');

class MongoService {
    constructor() {
        this.client = null;
        this.db = null;
        this.tokensCollection = null;
        this.categoriesCollection = null;
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;

        try {
            const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
            const dbName = process.env.MONGO_DB || 'spamTokenDetector';
            
            this.client = new MongoClient(mongoUri);
            await this.client.connect();
            this.db = this.client.db(dbName);
            this.tokensCollection = this.db.collection('tokenAnalysis');
            this.categoriesCollection = this.db.collection('categories');
            
            // Create indexes
            await this.tokensCollection.createIndex({ symbol: 1 }, { unique: true });
            await this.tokensCollection.createIndex({ timestamp: 1 });
            await this.tokensCollection.createIndex({ riskPercentage: 1 });
            await this.tokensCollection.createIndex({ shouldSkip: 1 });
            await this.tokensCollection.createIndex({ category: 1 });
            
            await this.categoriesCollection.createIndex({ symbol: 1 }, { unique: true });
            await this.categoriesCollection.createIndex({ category: 1 });
            
            // Create indexes for tokenFullDetails collection
            const fullDetailsCollection = this.db.collection('tokenFullDetails');
            await fullDetailsCollection.createIndex({ symbol: 1 }, { unique: true });
            await fullDetailsCollection.createIndex({ timestamp: 1 });
            
            this.connected = true;
            console.log('✅ MongoDB connected successfully');
        } catch (err) {
            console.error('❌ MongoDB connection failed:', err.message);
            throw err;
        }
    }

    async getToken(symbol) {
        await this.connect();
        const upperSymbol = symbol.toUpperCase();
        
        try {
            const token = await this.tokensCollection.findOne({ symbol: upperSymbol });
            if (!token) return null;

            const cacheTime = parseInt(process.env.CACHE_TIME_HOURS || '4');
            const expiryTime = cacheTime * 60 * 60 * 1000;
            
            if (Date.now() - token.timestamp > expiryTime) {
                await this.tokensCollection.deleteOne({ symbol: upperSymbol });
                return null;
            }

            return token;
        } catch (err) {
            console.error(`❌ MongoDB getToken failed for ${symbol}:`, err.message);
            return null;
        }
    }

    async saveFullTokenDetails(symbol, fullData) {
        await this.connect();
        const upperSymbol = symbol.toUpperCase();
        
        try {
            const collection = this.db.collection('tokenFullDetails');
            
            const document = {
                symbol: upperSymbol,
                ...fullData,
                savedAt: new Date().toISOString(),
                timestamp: Date.now()
            };
            
            await collection.updateOne(
                { symbol: upperSymbol },
                { $set: document },
                { upsert: true }
            );
            
            console.log(`💾 Saved FULL details for ${upperSymbol} to MongoDB (tokenFullDetails)`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to save full details for ${symbol}:`, error.message);
            return false;
        }
    }

    async getFullTokenDetails(symbol) {
        await this.connect();
        const upperSymbol = symbol.toUpperCase();
        
        try {
            const collection = this.db.collection('tokenFullDetails');
            return await collection.findOne({ symbol: upperSymbol });
        } catch (error) {
            console.error(`❌ Failed to get full details for ${symbol}:`, error.message);
            return null;
        }
    }

    async saveToken(symbol, data, timestamp) {
        await this.connect();
        const upperSymbol = symbol.toUpperCase();

        try {
            const category = this.determineCategory(data);
            
            await this.tokensCollection.updateOne(
                { symbol: upperSymbol },
                { 
                    $set: { 
                        ...data,
                        symbol: upperSymbol,
                        timestamp: timestamp,
                        category: category,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            
            await this.updateCategory(upperSymbol, category);
            
            console.log(`💾 Saved ${upperSymbol} to MongoDB (${category})`);
            return true;
        } catch (err) {
            console.error(`❌ MongoDB saveToken failed for ${symbol}:`, err.message);
            return false;
        }
    }

    determineCategory(data) {
        if (!data.riskPercentage && data.riskPercentage !== 0) return 'undefined';
        
        if (data.shouldSkip || data.riskPercentage >= 60) {
            return 'scam';
        }
        
        return 'trusted';
    }

    async updateCategory(symbol, category) {
        try {
            await this.categoriesCollection.updateOne(
                { symbol: symbol },
                { 
                    $set: { 
                        symbol: symbol,
                        category: category,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
        } catch (err) {
            console.error(`❌ Failed to update category for ${symbol}:`, err.message);
        }
    }

    async getAllTokens(options = {}) {
        await this.connect();
        
        const { limit = 100, category = null, minRisk = null } = options;
        
        try {
            let query = {};
            if (category) query.category = category;
            if (minRisk !== null) query.riskPercentage = { $gte: minRisk };
            
            const tokens = await this.tokensCollection
                .find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
                
            return tokens;
        } catch (err) {
            console.error('❌ MongoDB getAllTokens failed:', err.message);
            return [];
        }
    }

    async getTokensByCategory(category) {
        await this.connect();
        
        try {
            const tokens = await this.tokensCollection
                .find({ category: category })
                .sort({ timestamp: -1 })
                .toArray();
                
            return tokens;
        } catch (err) {
            console.error(`❌ MongoDB getTokensByCategory failed for ${category}:`, err.message);
            return [];
        }
    }

    async getCategoryStats() {
        await this.connect();
        
        try {
            const stats = await this.tokensCollection.aggregate([
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ]).toArray();
            
            const result = {
                total: 0,
                trusted: 0,
                scam: 0,
                undefined: 0
            };
            
            stats.forEach(stat => {
                result[stat._id] = stat.count;
                result.total += stat.count;
            });
            
            return result;
        } catch (err) {
            console.error('❌ MongoDB getCategoryStats failed:', err.message);
            return { total: 0, trusted: 0, scam: 0, undefined: 0 };
        }
    }

    async tokenExists(symbol) {
        await this.connect();
        const upperSymbol = symbol.toUpperCase();
        
        try {
            const count = await this.tokensCollection.countDocuments({ symbol: upperSymbol });
            return count > 0;
        } catch (err) {
            console.error(`❌ MongoDB tokenExists failed for ${symbol}:`, err.message);
            return false;
        }
    }

    async getUnsavedTokens(symbols) {
        await this.connect();
        const upperSymbols = symbols.map(s => s.toUpperCase());
        
        try {
            const savedTokens = await this.tokensCollection
                .find({ symbol: { $in: upperSymbols } })
                .project({ symbol: 1 })
                .toArray();
                
            const savedSymbols = new Set(savedTokens.map(t => t.symbol));
            const unsaved = upperSymbols.filter(s => !savedSymbols.has(s));
            
            return unsaved;
        } catch (err) {
            console.error('❌ MongoDB getUnsavedTokens failed:', err.message);
            return symbols;
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            console.log('✅ MongoDB connection closed');
        }
    }
}

module.exports = new MongoService();