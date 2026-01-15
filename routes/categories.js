// routes/categories.js
const express = require('express');
const router = express.Router();
const mongoService = require('../services/mongoService');

router.get('/categories', async (req, res) => {
    try {
        const minRiskPercentage = parseInt(req.query.minRiskPercentage) || 50;
        
        console.log(`\n📊 Fetching tokens with risk >= ${minRiskPercentage}%...`);
        
        const allTokens = await mongoService.getAllTokens({ limit: 10000 });
        
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
        
        res.json({
            success: true,
            timestamp: Date.now(),
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
        });
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