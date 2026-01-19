// routes/browserStatus.js - Browser manager status endpoint
const express = require('express');
const router = express.Router();
const browserManager = require('../services/browserManager');

router.get('/browser-status', (req, res) => {
  try {
    const stats = browserManager.getStats();
    
    res.json({
      success: true,
      browserStatus: {
        isAlive: stats.isAlive,
        activePages: stats.activePages,
        lastUsed: stats.lastUsed,
        idleTimeSeconds: stats.idleTime,
        status: stats.isAlive ? 'RUNNING' : 'STOPPED'
      },
      message: stats.isAlive 
        ? `Browser is active with ${stats.activePages} page(s) open` 
        : 'Browser is not running'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/browser-restart', async (req, res) => {
  try {
    await browserManager.restart();
    
    res.json({
      success: true,
      message: 'Browser restarted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/browser-close', async (req, res) => {
  try {
    await browserManager.close();
    
    res.json({
      success: true,
      message: 'Browser closed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;