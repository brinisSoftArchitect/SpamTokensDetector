// services/cacheService.js
const fs = require('fs').promises;
const path = require('path');

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
        const cached = this.cache.get(key);
        if (!cached) return null;

        const cacheEnabled = process.env.CACHE !== 'false';
        if (!cacheEnabled) return null;

        const cacheTime = parseInt(process.env.CACHE_TIME_HOURS || '4');
        const expiryTime = cacheTime * 60 * 60 * 1000;
        
        if (Date.now() - cached.timestamp > expiryTime) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    async set(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        await this.persist();
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
}

module.exports = new CacheService();