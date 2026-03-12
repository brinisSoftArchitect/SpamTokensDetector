// routes/categories.js
const express = require('express');
const router = express.Router();
const mongoService = require('../services/mongoService');

let categoriesCache = null;
let categoriesCacheTime = 0;
const CATEGORIES_CACHE_MS = 2 * 60 * 1000; // 2 minutes

// Exported so other routes can invalidate after saving a token
function invalidateCategoriesCache() {
    categoriesCache = null;
    categoriesCacheTime = 0;
}
module.exports.invalidateCategoriesCache = invalidateCategoriesCache;

router.get('/categories', async (req, res) => {
    try {
        const minRiskPercentage = parseInt(req.query.minRiskPercentage) || 50;

        const forceRefresh = req.query.t || req.query.force;
        const now = Date.now();
        if (!forceRefresh && categoriesCache && categoriesCache.filters?.minRiskPercentage === minRiskPercentage && (now - categoriesCacheTime) < CATEGORIES_CACHE_MS) {
            const ageSeconds = Math.round((now - categoriesCacheTime) / 1000);
            console.log(`⚡ Categories cache HIT (age: ${ageSeconds}s)`);
            return res.json({ ...categoriesCache, fromCache: true, cacheAge: ageSeconds });
        }

        console.log(`\n📊 Fetching tokens with risk >= ${minRiskPercentage}%...`);
        
        const allTokens = await mongoService.getAllTokens({ limit: 0 }); // 0 = no limit
        
        const trustedTokens = [];
        const scamTokens = [];
        const undefinedTokens = [];
        
        for (const token of allTokens) {
            // Use stored category first, then fall back to recalculating
            const storedCategory = token.category;
            
            if (storedCategory === 'scam') {
                // Respect stored category but re-check against current minRisk threshold
                const riskPct = typeof token.riskPercentage === 'number' ? token.riskPercentage : null;
                if (riskPct !== null && riskPct >= minRiskPercentage) {
                    scamTokens.push(token.symbol);
                } else if (riskPct !== null && riskPct < minRiskPercentage) {
                    // Risk is below the threshold slider — show as trusted
                    trustedTokens.push(token.symbol);
                } else {
                    scamTokens.push(token.symbol);
                }
            } else if (storedCategory === 'trusted') {
                // Could become scam if threshold is lowered
                const riskPct = typeof token.riskPercentage === 'number' ? token.riskPercentage : null;
                if (riskPct !== null && riskPct >= minRiskPercentage) {
                    scamTokens.push(token.symbol);
                } else {
                    trustedTokens.push(token.symbol);
                }
            } else {
                // undefined or missing category
                undefinedTokens.push(token.symbol);
            }
        }
        
        console.log(`✅ Categorization complete:`);
        console.log(`   Trusted: ${trustedTokens.length}`);
        console.log(`   Scam/High Risk (>=${minRiskPercentage}%): ${scamTokens.length}`);
        console.log(`   Undefined: ${undefinedTokens.length}`);
        
        const responseData = {
            success: true,
            timestamp: Date.now(),
            fromCache: false,
            filters: {
                minRiskPercentage: minRiskPercentage
            },
            stats: {
                total: allTokens.length,
                trusted: trustedTokens.length,
                scam: scamTokens.length,
                undefined: undefinedTokens.length
            },
            lists: {
                trusted: trustedTokens,
                scam: scamTokens,
                undefined: undefinedTokens
            }
        };

        categoriesCache = responseData;
        categoriesCacheTime = Date.now();

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch categories',
            details: error.message 
        });
    }
});

router.invalidateCategoriesCache = invalidateCategoriesCache;
module.exports = router;