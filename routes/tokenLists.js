// routes/tokenLists.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../services/mongoService');

/**
 * GET /api/token-lists
 * Returns categorized token lists based on risk analysis
 * Query params:
 *   - minRisk: minimum risk percentage for scam tokens (default: 50)
 */
router.get('/', async (req, res) => {
  try {
    const minRisk = parseInt(req.query.minRisk) || 38;
    const db = getDb();
    const tokensCol = db.collection('tokens');

    const allTokens = await tokensCol.find({}, { projection: { symbol: 1, 'data.gapHunterBotRisk': 1, 'data.isNativeToken': 1 } }).toArray();

    const trusted = [];
    const scam = [];
    const undefinedList = [];

    for (const tokenDoc of allTokens) {
      const symbol = tokenDoc.symbol;
      if (!symbol) continue;
      const risk = tokenDoc?.data?.gapHunterBotRisk?.riskPercentage;
      if (risk === undefined || risk === null) {
        undefinedList.push(symbol);
      } else if (risk >= minRisk) {
        scam.push(symbol);
      } else {
        trusted.push(symbol);
      }
    }

    trusted.sort();
    scam.sort();
    undefinedList.sort();

    res.json({
      success: true,
      timestamp: Date.now(),
      filters: { minRiskPercentage: minRisk },
      stats: {
        total: allTokens.length,
        trusted: trusted.length,
        scam: scam.length,
        undefined: undefinedList.length
      },
      lists: { trusted, scam, undefined: undefinedList }
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
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const tokensCol = db.collection('tokens');
    const allTokens = await tokensCol.find({}, { projection: { symbol: 1, 'data.gapHunterBotRisk': 1, 'data.isNativeToken': 1 } }).toArray();

    const stats = {
      total: 0, trusted: 0, scam: 0, undefined: 0,
      riskDistribution: { '0-10': 0, '10-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 },
      nativeTokens: 0, contractTokens: 0
    };

    for (const tokenDoc of allTokens) {
      stats.total++;
      const risk = tokenDoc?.data?.gapHunterBotRisk?.riskPercentage;
      if (risk === undefined || risk === null) { stats.undefined++; continue; }
      risk >= 38 ? stats.scam++ : stats.trusted++;
      if (risk < 10) stats.riskDistribution['0-10']++;
      else if (risk < 25) stats.riskDistribution['10-25']++;
      else if (risk < 50) stats.riskDistribution['25-50']++;
      else if (risk < 75) stats.riskDistribution['50-75']++;
      else stats.riskDistribution['75-100']++;
      tokenDoc?.data?.isNativeToken ? stats.nativeTokens++ : stats.contractTokens++;
    }

    res.json({ success: true, timestamp: Date.now(), stats });

  } catch (error) {
    console.error('Error reading token stats:', error);
    res.status(500).json({ success: false, error: 'Failed to read token stats', message: error.message });
  }
});

module.exports = router;