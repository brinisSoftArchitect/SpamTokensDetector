// services/cacheService.js
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const mongoService = require('./mongoService');

class CacheService {
    constructor() {
        this.memCache = new Map();
        this.cacheDir = process.env.CACHE_DIR || path.join(os.homedir(), 'antiscam', 'cache');
        this.tokensDir = path.join(this.cacheDir, 'tokens');
        this.categoriesFile = path.join(this.cacheDir, 'categories.json');
        this.initCache();
    }

    async initCache() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.tokensDir, { recursive: true });
            console.log(`📁 Cache dir: ${this.cacheDir}`);
            console.log(`📁 Tokens dir: ${this.tokensDir}`);

            // Load each token file into memory (skip failed results)
            try {
                const files = await fs.readdir(this.tokensDir);
                const tokenFiles = files.filter(f => f.endsWith('.json'));
                let loaded = 0, skipped = 0;
                for (const file of tokenFiles) {
                    const symbol = file.replace('.json', '');
                    const filePath = path.join(this.tokensDir, file);
                    try {
                        const raw = await fs.readFile(filePath, 'utf8');
                        const entry = JSON.parse(raw);
                        const d = entry.data;
                        // Skip loading failed/empty cached results
                        if (!d || d.success === false || (!d.chainsFound && !d.isNativeToken && !d.noContractFound)) {
                            await fs.unlink(filePath).catch(() => {});
                            skipped++;
                            continue;
                        }
                        this.memCache.set(symbol, entry);
                        loaded++;
                    } catch(e) { skipped++; }
                }
                console.log(`📥 Loaded ${loaded} token files into memory (${skipped} stale/failed purged)`);
            } catch (err) {
                console.log('No existing token files, starting fresh');
            }
        } catch (err) {
            console.error('Error initializing cache:', err);
        }
    }

    async get(symbol) {
        return this.getApiResponse(symbol);
    }

    async set(symbol, data) {
        return this.setApiResponse(symbol, data);
    }

    async getApiResponse(symbol) {
        if (process.env.CACHE === 'false') return null;

        const key = symbol.toUpperCase();
        const cached = this.memCache.get(key);
        if (!cached) return null;

        const cacheTimeMs = parseInt(process.env.CACHE_TIME_HOURS || '4') * 60 * 60 * 1000;
        if (Date.now() - cached.timestamp > cacheTimeMs) {
            this.memCache.delete(key);
            fs.unlink(path.join(this.tokensDir, key + '.json')).catch(() => {});
            console.log(`🗑️  Cache expired for ${key}`);
            return null;
        }

        const ageMin = Math.round((Date.now() - cached.timestamp) / 60000);
        console.log(`⚡ Cache HIT: ${key} (age: ${ageMin}min) <- ${path.join(this.tokensDir, key + '.json')}`);
        return cached.data;
    }

    async setApiResponse(symbol, data) {
        const key = symbol.toUpperCase();
        // Don't cache failed/empty results or results with no real data
        const hasRealData = data && data.success !== false && 
          (data.chainsFound > 0 || data.isNativeToken || data.noContractFound);
        if (!hasRealData) {
            console.log(`⚠️  Skipping cache for empty/failed result: ${key}`);
            this.memCache.delete(key);
            const filePath = path.join(this.tokensDir, key + '.json');
            fs.unlink(filePath).catch(() => {});
            return;
        }
        const entry = { timestamp: Date.now(), data };
        this.memCache.set(key, entry);

        // Invalidate categories cache when a token is updated
        try {
            const categoriesRouter = require('../routes/categories');
            if (categoriesRouter.invalidateCategoriesCache) {
                categoriesRouter.invalidateCategoriesCache();
            }
        } catch(e) {}

        const filePath = path.join(this.tokensDir, key + '.json');
        try {
            await fs.mkdir(this.tokensDir, { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
            const stat = await fs.stat(filePath);
            console.log(`💾 Token saved: ${filePath} (${(stat.size / 1024).toFixed(1)} KB)`);
        } catch (err) {
            console.error(`❌ Failed to write ${filePath}: ${err.message}`);
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
        } catch {
            return { scam: [], canBuy: [] };
        }
    }

    getAllCached() {
        const result = {};
        for (const [key, value] of this.memCache.entries()) {
            result[key] = value.data;
        }
        return result;
    }

    async clearToken(symbol) {
        const key = symbol.toUpperCase();
        this.memCache.delete(key);
        const filePath = path.join(this.tokensDir, key + '.json');
        try {
            await fs.unlink(filePath);
            console.log(`🗑️  Cache cleared for ${key}`);
        } catch (err) {
            // File may not exist, that's fine
        }
        return true;
    }

    async closeConnections() {
        await mongoService.close();
    }
}

module.exports = new CacheService();
