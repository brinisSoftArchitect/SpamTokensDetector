// routes/categories.js
const express = require('express');
const router = express.Router();
const mongoService = require('../services/mongoService');

let categoriesCache = null;
let categoriesCacheTime = 0;
const CATEGORIES_CACHE_MS = 2 * 60 * 1000; // 2 minutes

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
            const riskPercentage = token.riskPercentage || 0;
            const hasValidRiskData = typeof token.riskPercentage === 'number' && 
                                    !isNaN(token.riskPercentage) && 
                                    token.riskPercentage > 0;
            
            const hasValidHolderData = token.holderConcentration && 
                                      typeof token.holderConcentration === 'object' &&
                                      token.holderConcentration !== null &&
                                      typeof token.holderConcentration.top10Percentage === 'number';
            
            // Categorize based on risk percentage if available
            if (!hasValidRiskData) {
                // No valid risk data at all
                undefinedTokens.push(token.symbol);
            } else if (riskPercentage >= minRiskPercentage) {
                // High risk - categorize as scam
                scamTokens.push(token.symbol);
            } else {
                // Low risk - categorize as trusted
                trustedTokens.push(token.symbol);
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

module.exports = router;