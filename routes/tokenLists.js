// routes/tokenLists.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../cache/symbol-analysis.json');

/**
 * GET /api/token-lists
 * Returns categorized token lists based on risk analysis
 * Query params:
 *   - minRisk: minimum risk percentage for risk tokens (default: 50)
 *   - includeMetadata: include full token data (default: false)
 */
router.get('/token-lists', async (req, res) => {
  try {
    const minRisk = parseInt(req.query.minRisk) || 50;
    const includeMetadata = req.query.includeMetadata === 'true';

    // Read cache file
    const cacheData = await fs.readFile(CACHE_FILE, 'utf8');
    const tokens = JSON.parse(cacheData);

    const trusted = [];
    const risk = [];
    const undefined = [];

    // Categorize tokens
    for (const [symbol, tokenData] of Object.entries(tokens)) {
      if (!tokenData.data || !tokenData.data.success) {
        undefined.push(symbol);
        continue;
      }

      const gapHunterRisk = tokenData.data.gapHunterBotRisk;
      
      if (!gapHunterRisk || gapHunterRisk.riskPercentage === undefined) {
        undefined.push(symbol);
        continue;
      }

      const riskPercentage = gapHunterRisk.riskPercentage;

      if (riskPercentage >= minRisk) {
        risk.push(symbol);
      } else {
        trusted.push(symbol);
      }
    }

    res.json({
      success: true,
      timestamp: Date.now(),
      stats: {
        total: Object.keys(tokens).length,
        trusted: trusted.length,
        risk: risk.length,
        undefined: undefined.length
      },
      trusted,
      risk,
      undefined
    });

  } catch (error) {
    console.error('Error reading token lists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read token lists',
      message: error.message
    });
  }
});

/**
 * GET /api/token-lists/stats
 * Returns statistics about token categorization
 */
router.get('/token-lists/stats', async (req, res) => {
  try {
    const cacheData = await fs.readFile(CACHE_FILE, 'utf8');
    const tokens = JSON.parse(cacheData);

    const stats = {
      total: 0,
      trusted: 0,
      risk: 0,
      undefined: 0,
      riskDistribution: {
        '0-10': 0,
        '10-25': 0,
        '25-50': 0,
        '50-75': 0,
        '75-100': 0
      },
      nativeTokens: 0,
      contractTokens: 0
    };

    for (const [symbol, tokenData] of Object.entries(tokens)) {
      stats.total++;

      if (!tokenData.data || !tokenData.data.gapHunterBotRisk) {
        stats.undefined++;
        continue;
      }

      const risk = tokenData.data.gapHunterBotRisk.riskPercentage;
      
      if (risk >= 50) {
        stats.risk++;
      } else {
        stats.trusted++;
      }

      // Risk distribution
      if (risk < 10) stats.riskDistribution['0-10']++;
      else if (risk < 25) stats.riskDistribution['10-25']++;
      else if (risk < 50) stats.riskDistribution['25-50']++;
      else if (risk < 75) stats.riskDistribution['50-75']++;
      else stats.riskDistribution['75-100']++;

      // Token type
      if (tokenData.data.isNativeToken) {
        stats.nativeTokens++;
      } else {
        stats.contractTokens++;
      }
    }

    res.json({
      success: true,
      timestamp: Date.now(),
      stats
    });

  } catch (error) {
    console.error('Error reading token stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read token stats',
      message: error.message
    });
  }
});

module.exports = router;
