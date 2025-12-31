// services/categorizer.js
const cacheService = require('./cacheService');

class CategorizerService {
    async categorizeSymbols() {
        const allCached = cacheService.getAllCached();
        const categories = {
            scam: [],
            canBuy: []
        };

        for (const [symbol, data] of Object.entries(allCached)) {
            if (!data || !data.AIriskScore) continue;

            const score = data.AIriskScore.score;
            
            if (score >= 30) {
                categories.scam.push(symbol);
            } else if (score < 30) {
                categories.canBuy.push(symbol);
            }
        }

        await cacheService.saveCategories(categories);
        return categories;
    }
}

module.exports = new CategorizerService();