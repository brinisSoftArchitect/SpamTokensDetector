// routes/spamDetector.js - API routes
const express = require('express');
const router = express.Router();
const tokenAnalyzer = require('../services/tokenAnalyzer');

router.post('/check-token', async (req, res) => {
  try {
    const { contractAddress, network } = req.body;

    if (!contractAddress || !network) {
      return res.status(400).json({
        error: 'Contract address and network are required',
        example: {
          contractAddress: '0x...',
          network: 'bsc'
        }
      });
    }

    const result = await tokenAnalyzer.analyzeToken(contractAddress, network);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing token:', error.message);
    res.status(500).json({
      error: 'Failed to analyze token',
      details: error.message
    });
  }
});

module.exports = router;