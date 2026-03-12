// server.js - Main server file
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const spamDetectorRoutes = require('./routes/spamDetector');
const categoriesRoutes = require('./routes/categories');
const tokenListsRoutes = require('./routes/tokenLists');
const cronService = require('./services/cronService');
const cacheService = require('./services/cacheService');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api', spamDetectorRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', tokenListsRoutes);

app.delete('/api/cache/clear/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        await cacheService.clearToken(symbol);
        res.json({ success: true, message: `Cache cleared for ${symbol}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/cache/clear/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        await cacheService.clearToken(symbol);
        res.json({ success: true, message: `Cache cleared for ${symbol}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => {
  res.json({
    message: 'Spam Token Detector API',
    version: '1.0.0',
    endpoints: {
      checkTokenPost: {
        method: 'POST',
        path: '/api/check-token',
        description: 'Check if a token is spam',
        body: {
          contractAddress: '0x...',
          network: 'bsc'
        }
      },
      checkTokenGet: {
        method: 'GET',
        path: '/api/check-token/{network}/{contractAddress}',
        description: 'Check if a token is spam on a specific chain',
        example: '/api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8'
      },
      checkBySymbol: {
        method: 'GET',
        path: '/api/check-symbol/{symbol}',
        description: 'Check token across all chains by symbol',
        example: '/api/check-symbol/FTT'
      },
      topHolders: {
        method: 'GET',
        path: '/api/top-holders/{network}/{contractAddress}',
        description: 'Get detailed top 10 holders for a token',
        example: '/api/top-holders/eth/0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9'
      },
      checkMultiChain: {
        method: 'POST',
        path: '/api/check-multi-chain',
        description: 'Check specific contracts across multiple chains'
      },
      examples: {
        method: 'GET',
        path: '/api/examples',
        description: 'Get example tokens to test'
      }
    },
    quickTests: {
      singleChain: 'http://localhost:3005/api/check-token/eth/0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9',
      bySymbol: 'http://localhost:3005/api/check-symbol/FTT',
      topHolders: 'http://localhost:3005/api/top-holders/eth/0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9',
      examples: 'http://localhost:3005/api/examples'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  cronService.start();
});