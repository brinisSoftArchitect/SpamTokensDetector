// services/contractCache.js - Permanent cache for contract addresses using MongoDB
// Contract addresses never change, so cache them indefinitely

class ContractCache {
  constructor() {
    this.memCache = {}; // in-memory for fast access
    this.collection = null;
    this.ready = false;
    this.init();
  }

  async init() {
    try {
      const mongoose = require('mongoose');
      // Wait for mongoose to be connected
      if (mongoose.connection.readyState !== 1) {
        mongoose.connection.once('connected', () => this._setupCollection());
      } else {
        this._setupCollection();
      }
    } catch (e) {
      console.log('[ContractCache] MongoDB not available, using memory only');
    }
  }

  _setupCollection() {
    try {
      const mongoose = require('mongoose');
      const schema = new mongoose.Schema({
        symbol: { type: String, unique: true, index: true },
        contracts: [{
          network: String,
          address: String,
          explorer: String
        }],
        cachedAt: { type: Date, default: Date.now }
      });
      // Use existing model if already compiled
      this.collection = mongoose.models.ContractCache ||
        mongoose.model('ContractCache', schema);
      this.ready = true;
      console.log('[ContractCache] ✅ MongoDB collection ready');
      // Pre-load all into memory cache for instant access
      this._preload();
    } catch (e) {
      console.log('[ContractCache] Collection setup failed:', e.message);
    }
  }

  async _preload() {
    try {
      const all = await this.collection.find({}).lean();
      all.forEach(doc => {
        this.memCache[doc.symbol] = doc.contracts;
      });
      console.log(`[ContractCache] Preloaded ${all.length} symbols into memory`);
    } catch (e) {
      console.log('[ContractCache] Preload failed:', e.message);
    }
  }

  get(symbol) {
    const key = symbol.toUpperCase();
    const entry = this.memCache[key];
    if (!entry) return null;
    console.log(`[ContractCache] ✅ HIT for ${symbol}: ${entry.length} contracts`);
    return entry;
  }

  async set(symbol, contracts) {
    if (!contracts || contracts.length === 0) return;
    const key = symbol.toUpperCase();

    // Always update memory cache immediately
    this.memCache[key] = contracts;

    // Persist to MongoDB asynchronously
    if (this.ready && this.collection) {
      try {
        await this.collection.findOneAndUpdate(
          { symbol: key },
          { symbol: key, contracts, cachedAt: new Date() },
          { upsert: true, new: true }
        );
        console.log(`[ContractCache] 💾 Saved ${contracts.length} contracts for ${symbol} to MongoDB`);
      } catch (e) {
        console.log(`[ContractCache] MongoDB save failed (kept in memory): ${e.message}`);
      }
    } else {
      console.log(`[ContractCache] 💾 Saved ${contracts.length} contracts for ${symbol} (memory only)`);
    }
  }

  has(symbol) {
    return !!this.memCache[symbol.toUpperCase()];
  }
}

module.exports = new ContractCache();
