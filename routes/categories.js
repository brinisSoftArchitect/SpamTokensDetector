// routes/categories.js
const express = require('express');
const router = express.Router();
const mongoService = require('../services/mongoService');
const stTokenService = require('../modules/ST/ST');

function getSTBaseSymbolSet() {
    const raw = stTokenService.getSTTokensSync() || [];
    const set = new Set();
    raw.forEach((pair) => {
        if (typeof pair !== 'string') return;
        const base = pair.split('_')[0];
        if (base) set.add(base.toUpperCase());
    });
    return set;
}

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
        const minRiskPercentage = parseInt(req.query.minRiskPercentage || req.query.minRisk) || 38;

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
        const tokenRiskMap = {}; // symbol -> riskPercentage
        const tokenSTMap = {}; // symbol -> boolean, ST is independent of scam/trusted/undefined
        const stSymbolSet = getSTBaseSymbolSet();
        let stCount = 0;

        for (const token of allTokens) {
            if (token.symbol) {
                const isST = stSymbolSet.has(String(token.symbol).toUpperCase());
                tokenSTMap[token.symbol] = isST;
                if (isST) stCount++;
            }
            // Use stored category first, then fall back to recalculating
            const storedCategory = token.category;

            const riskPct = typeof token.riskPercentage === 'number' ? token.riskPercentage : null;
            if (storedCategory === 'scam') {
                if (riskPct !== null && riskPct < minRiskPercentage) {
                    trustedTokens.push(token.symbol);
                    tokenRiskMap[token.symbol] = riskPct;
                } else {
                    scamTokens.push(token.symbol);
                    tokenRiskMap[token.symbol] = riskPct !== null ? riskPct : 100;
                }
            } else if (storedCategory === 'trusted') {
                if (riskPct !== null && riskPct >= minRiskPercentage) {
                    scamTokens.push(token.symbol);
                    tokenRiskMap[token.symbol] = riskPct;
                } else {
                    trustedTokens.push(token.symbol);
                    tokenRiskMap[token.symbol] = riskPct !== null ? riskPct : 0;
                }
            } else {
                undefinedTokens.push(token.symbol);
                tokenRiskMap[token.symbol] = riskPct !== null ? riskPct : null;
            }
        }

        console.log(`✅ Categorization complete:`);
        console.log(`   Trusted: ${trustedTokens.length}`);
        console.log(`   Scam/High Risk (>=${minRiskPercentage}%): ${scamTokens.length}`);
        console.log(`   Undefined: ${undefinedTokens.length}`);
        console.log(`   ST tagged: ${stCount}`);

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
                undefined: undefinedTokens.length,
                st: stCount
            },
            lists: {
                trusted: trustedTokens.sort((a, b) => (tokenRiskMap[a] ?? 0) - (tokenRiskMap[b] ?? 0)),
                scam: scamTokens.sort((a, b) => (tokenRiskMap[b] ?? 100) - (tokenRiskMap[a] ?? 100)),
                undefined: undefinedTokens,
                riskMap: tokenRiskMap,
                stMap: tokenSTMap
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

router.get('/st-tokens', (req, res) => {
    try {
        const raw = stTokenService.getSTTokensSync() || [];
        const symbols = Array.from(getSTBaseSymbolSet()).sort();
        res.json({ success: true, count: symbols.length, tokens: symbols, pairs: raw });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to read ST tokens', details: error.message });
    }
});

router.invalidateCategoriesCache = invalidateCategoriesCache;
module.exports = router;