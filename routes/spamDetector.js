// routes/spamDetector.js - API routes
const express = require('express');
const router = express.Router();
const tokenAnalyzer = require('../services/tokenAnalyzer');
const multiChainAnalyzer = require('../services/multiChainAnalyzer');

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

router.get('/check-token/:network/:contractAddress', async (req, res) => {
  try {
    const { contractAddress, network } = req.params;

    if (!contractAddress || !network) {
      return res.status(400).json({
        error: 'Contract address and network are required',
        example: 'GET /api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8'
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

router.get('/check-symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        error: 'Token symbol is required',
        example: 'GET /api/check-symbol/DVI'
      });
    }

    const result = await multiChainAnalyzer.analyzeBySymbol(symbol);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing token by symbol:', error.message);
    res.status(500).json({
      error: 'Failed to analyze token by symbol',
      details: error.message
    });
  }
});

router.post('/check-multi-chain', async (req, res) => {
  try {
    const { contracts } = req.body;

    if (!contracts || !Array.isArray(contracts) || contracts.length === 0) {
      return res.status(400).json({
        error: 'Array of contracts is required',
        example: {
          contracts: [
            { address: '0x...', network: 'bsc' },
            { address: '0x...', network: 'eth' }
          ]
        }
      });
    }

    const result = await multiChainAnalyzer.analyzeMultipleChains(contracts);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing multi-chain token:', error.message);
    res.status(500).json({
      error: 'Failed to analyze multi-chain token',
      details: error.message
    });
  }
});

router.get('/debug-html/:network/:contractAddress', async (req, res) => {
  try {
    const { contractAddress, network } = req.params;
    const axios = require('axios');
    const blockchainService = require('../services/blockchainService');
    
    const scanUrl = blockchainService.getScanUrl(network, contractAddress);
    const response = await axios.get(scanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      timeout: 20000
    });
    
    const html = response.data;
    const hasHolders = html.includes('Top 1,000 holders');
    const hasHighlight = html.includes('data-highlight-target');
    const hasMaintable = html.includes('id="maintable"');
    
    res.json({
      url: scanUrl,
      htmlLength: html.length,
      patterns: {
        hasHoldersText: hasHolders,
        hasHighlightTarget: hasHighlight,
        hasMaintable: hasMaintable
      },
      sample: html.substring(0, 1000)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/examples', (req, res) => {
  res.json({
    message: 'Spam Token Detector - Example Tokens to Test',
    examples: [
      {
        name: 'Wrapped ETH (WETH) - Legitimate',
        network: 'bsc',
        contractAddress: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
        testUrl: '/api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8'
      },
      {
        name: 'Binance USD (BUSD) - Legitimate',
        network: 'bsc',
        contractAddress: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
        testUrl: '/api/check-token/bsc/0xe9e7cea3dedca5984780bafc599bd69add087d56'
      },
      {
        name: 'PancakeSwap Token (CAKE) - Legitimate',
        network: 'bsc',
        contractAddress: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
        testUrl: '/api/check-token/bsc/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82'
      },
      {
        name: 'USDT on Ethereum',
        network: 'eth',
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        testUrl: '/api/check-token/eth/0xdac17f958d2ee523a2206206994597c13d831ec7'
      },
      {
        name: 'Test with your own token',
        network: 'bsc|eth|polygon|arbitrum|avalanche',
        contractAddress: 'your_contract_address',
        testUrl: '/api/check-token/{network}/{contractAddress}'
      }
    ],
    symbolExamples: [
      {
        name: 'Division Network (DVI) - Multi-chain',
        symbol: 'DVI',
        testUrl: '/api/check-symbol/DVI'
      },
      {
        name: 'Wrapped ETH (WETH)',
        symbol: 'WETH',
        testUrl: '/api/check-symbol/WETH'
      },
      {
        name: 'Binance USD (BUSD)',
        symbol: 'BUSD',
        testUrl: '/api/check-symbol/BUSD'
      },
      {
        name: 'USD Tether (USDT)',
        symbol: 'USDT',
        testUrl: '/api/check-symbol/USDT'
      }
    ],
    usage: {
      singleChain: {
        method: 'GET',
        endpoint: '/api/check-token/{network}/{contractAddress}',
        parameters: {
          network: 'bsc, eth, polygon, arbitrum, avalanche',
          contractAddress: 'Token contract address (0x...)'
        }
      },
      bySymbol: {
        method: 'GET',
        endpoint: '/api/check-symbol/{symbol}',
        description: 'Analyzes token across all available chains',
        parameters: {
          symbol: 'Token symbol (e.g., DVI, WETH, USDT)'
        },
        example: '/api/check-symbol/DVI'
      },
      multiChain: {
        method: 'POST',
        endpoint: '/api/check-multi-chain',
        description: 'Analyze specific contracts across multiple chains',
        body: {
          contracts: [
            { address: '0x...', network: 'bsc' },
            { address: '0x...', network: 'eth' }
          ]
        }
      }
    }
  });
});

module.exports = router;