// routes/spamDetector.js - API routes
const express = require('express');
const router = express.Router();
const tokenAnalyzer = require('../services/tokenAnalyzer');
const multiChainAnalyzer = require('../services/multiChainAnalyzer');
const holderConcentrationService = require('../services/holderConcentrationService');
const cacheService = require('../services/cacheService');

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
    const { forceFresh } = req.query;

    if (!symbol) {
      return res.status(400).json({
        error: 'Token symbol is required',
        example: 'GET /api/check-symbol/DVI'
      });
    }

    // Skip cache if forceFresh is true or if cached data is invalid
    if (!forceFresh) {
      const cached = await cacheService.get(symbol);
      if (cached?.data?.success && cached?.data?.gapHunterBotRisk?.riskPercentage !== undefined) {
        console.log(`Returning cached data for ${symbol}`);
        return res.json(cached);
      }
    }

    console.log(`Fetching fresh data for ${symbol}${forceFresh ? ' (forced)' : ' (invalid cache)'}`);
    const result = await multiChainAnalyzer.analyzeBySymbol(symbol);
    
    // Return full result to client, but cache will save reduced version
    await cacheService.set(symbol, result);
    
    // Enhance with NEW holder concentration analysis if we have network and address
    if (result && result.network && result.contractAddress) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 ENHANCING WITH NEW HOLDER CONCENTRATION SERVICE`);
      console.log(`   Symbol: ${symbol}`);
      console.log(`   Network: ${result.network}`);
      console.log(`   Address: ${result.contractAddress}`);
      console.log(`${'='.repeat(80)}`);
      
      try {
        const holderAnalysis = await holderConcentrationService.analyzeHolderConcentration({
          network: result.network,
          address: result.contractAddress,
          symbol: symbol
        });
        
        if (holderAnalysis.success) {
          console.log(`✅ NEW holder service successful (${holderAnalysis.method})`);
          console.log(`   Top 1: ${holderAnalysis.holderConcentration.top1Percentage}%`);
          console.log(`   Top 10: ${holderAnalysis.holderConcentration.top10Percentage}%`);
          console.log(`   Risk: ${holderAnalysis.holderConcentration.concentrationLevel}`);
          
          // Replace holder data with new service results
          result.holderConcentration = {
            success: true,
            top1Percentage: holderAnalysis.holderConcentration.top1Percentage,
            top1Address: holderAnalysis.holderConcentration.top1Address,
            top1Label: holderAnalysis.holderConcentration.top1Label,
            top10Percentage: holderAnalysis.holderConcentration.top10Percentage,
            concentrationLevel: holderAnalysis.holderConcentration.concentrationLevel,
            rugPullRisk: holderAnalysis.holderConcentration.rugPullRisk,
            top10Holders: holderAnalysis.holderConcentration.top10Holders,
            top10HoldersDetailed: holderAnalysis.holderConcentration.top10Holders,
            blackholePercentage: holderAnalysis.holderConcentration.blackholePercentage,
            blackholeCount: holderAnalysis.holderConcentration.blackholeCount,
            holdersBreakdown: holderAnalysis.holderConcentration.holdersBreakdown,
            analysisMethod: holderAnalysis.method,
            dataSource: 'holderConcentrationService'
          };
        } else {
          console.log(`⚠️ NEW holder service failed: ${holderAnalysis.error}`);
          console.log(`   Keeping existing holder data from multiChainAnalyzer`);
          // Keep existing holder data from multiChainAnalyzer
          if (result.holderConcentration) {
            result.holderConcentration.analysisMethod = 'Legacy';
            result.holderConcentration.dataSource = 'multiChainAnalyzer';
          }
        }
      } catch (holderError) {
        console.error(`❌ Holder service error: ${holderError.message}`);
        // Keep existing data
        if (result.holderConcentration) {
          result.holderConcentration.analysisMethod = 'Legacy (error)'; 
          result.holderConcentration.dataSource = 'multiChainAnalyzer';
        }
      }
      
      console.log(`${'='.repeat(80)}\n`);
    }
    
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

router.get('/top-holders/:network/:contractAddress', async (req, res) => {
  try {
    const { network, contractAddress } = req.params;
    
    console.log(`\n=== TOP HOLDERS REQUEST ===`);
    console.log(`Network: ${network}`);
    console.log(`Contract: ${contractAddress}`);
    
    const result = await tokenAnalyzer.analyzeToken(contractAddress, network);
    
    const top10Holders = result.holderConcentration?.top10HoldersDetailed || [];
    
    res.json({
      success: true,
      token: result.token,
      totalHolders: result.holderConcentration?.totalHolders || 0,
      top10Combined: result.holderConcentration?.top10Percentage || 0,
      top10Holders: top10Holders,
      summary: {
        mostConcentrated: top10Holders[0] || null,
        leastConcentrated: top10Holders[9] || null,
        exchangeHolders: top10Holders.filter(h => h.isExchange).length,
        blackholeHolders: top10Holders.filter(h => h.isBlackhole).length,
        regularHolders: top10Holders.filter(h => h.type === 'Regular').length
      },
      dataSource: result.holderConcentration?.dataSource || 'unknown'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
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
        network: 'bsc|eth|polygon|arbitrum|avalanche|monad|base|optimism|fantom',
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
          network: 'bsc, eth, polygon, arbitrum, avalanche, monad, base, optimism, fantom',
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