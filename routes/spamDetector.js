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
    const symbol = decodeURIComponent(req.params.symbol);
    const { forceFresh } = req.query;

    if (!symbol) {
      return res.status(400).json({
        error: 'Token symbol is required',
        example: 'GET /api/check-symbol/DVI'
      });
    }

    // Skip cache if forceFresh is true
    if (!forceFresh) {
      const cached = await cacheService.getApiResponse(symbol);
      // Only serve cache if result was successful and has real data
      if (cached && cached.success !== false && (cached.chainsFound > 0 || cached.isNativeToken || cached.noContractFound)) {
        const os = require('os');
        const path = require('path');
        const filePath = path.join(os.homedir(), 'antiscam', 'cache', 'tokens', symbol.toUpperCase() + '.json');
        console.log(`\n${'='.repeat(60)}`);
        console.log(`⚡ CACHE HIT - serving from: ${filePath}`);
        console.log(`${'='.repeat(60)}\n`);
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-File', filePath);
        return res.json(cached);
      } else if (cached && (cached.success === false || (!cached.chainsFound && !cached.isNativeToken))) {
        // Stale failed cache — purge it silently before re-fetching
        console.log(`🗑️  Purging stale/failed cache for ${symbol}, re-fetching...`);
        await cacheService.clearToken(symbol);
      }
    }

    console.log(`Fetching fresh data for ${symbol}${forceFresh ? ' (forced)' : ' (invalid cache)'}`);
    let result = await multiChainAnalyzer.analyzeBySymbol(symbol);

    // If no contracts found, try to still build a partial result using CMC/CoinGecko
    if (!result || result.success === false) {
      console.log(`\n[spamDetector] No contracts found for ${symbol}, attempting partial data fetch...`);
      try {
        const cmcService = require('../services/cmcService');
        const coingeckoService = require('../services/coingeckoService');
        const [cmcData, cgData] = await Promise.allSettled([
          cmcService.getTokenInfoBySymbol ? cmcService.getTokenInfoBySymbol(symbol) : Promise.reject('no method'),
          coingeckoService.searchBySymbol ? coingeckoService.searchBySymbol(symbol) : Promise.reject('no method')
        ]);
        const hasSomeData = cmcData.status === 'fulfilled' || cgData.status === 'fulfilled';
        if (!hasSomeData) {
          console.log(`[spamDetector] No partial data available for ${symbol}`);
        }
      } catch(e) {
        console.log(`[spamDetector] Partial fetch error: ${e.message}`);
      }
    }
    
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
    
    // Save to MongoDB - always attempt save with determined category
    try {
      const mongoService = require('../services/mongoService');
      const cronService = require('../services/cronService');

      const hasValidRiskData = result && result.gapHunterBotRisk &&
                               typeof result.gapHunterBotRisk.riskPercentage === 'number' &&
                               !isNaN(result.gapHunterBotRisk.riskPercentage);

      if (result && (result.success || result.isNativeToken)) {
        let compactData;

        if (result.isNativeToken) {
          compactData = {
            success: true,
            symbol: symbol.toUpperCase(),
            isNativeToken: true,
            chainsFound: 0,
            globalSpamScore: 0,
            riskPercentage: 10,
            shouldSkip: false,
            AIRiskScore: null,
            holderConcentration: {
              top1Percentage: 0, top1Address: null, top1Label: null,
              top1IsExchange: false, top1IsBlackhole: false,
              top10Percentage: 0, concentrationLevel: 'UNKNOWN', rugPullRisk: false
            }
          };
        } else if (hasValidRiskData) {
          compactData = cronService.createCompactAnalysis(symbol, result);
        } else {
          // No risk data - save as undefined category
          compactData = {
            success: false,
            symbol: symbol.toUpperCase(),
            isNativeToken: false,
            chainsFound: result.chainsFound || 0,
            globalSpamScore: result.globalSpamScore || 0,
            riskPercentage: null,
            shouldSkip: false,
            AIRiskScore: null,
            holderConcentration: {
              top1Percentage: 0, top1Address: null, top1Label: null,
              top1IsExchange: false, top1IsBlackhole: false,
              top10Percentage: 0, concentrationLevel: 'UNKNOWN', rugPullRisk: false
            }
          };
        }

        try {
          await mongoService.saveToken(symbol.toUpperCase(), compactData, Date.now());
          const category = mongoService.determineCategory(compactData);
          console.log(`💾 Saved ${symbol} to MongoDB — category: ${category} (risk: ${compactData.riskPercentage ?? 'N/A'}%)`);
          // Invalidate categories cache so next request gets fresh data
          try { require('./categories').invalidateCategoriesCache(); } catch(e) {}
        } catch (mongoError) {
          console.log(`⚠️  MongoDB save failed (non-critical): ${mongoError.message}`);
        }
      } else {
        // result is null/undefined or success=false with no data — save as undefined
        const fallbackData = {
          success: false,
          symbol: symbol.toUpperCase(),
          isNativeToken: false,
          chainsFound: 0,
          globalSpamScore: 0,
          riskPercentage: null,
          shouldSkip: false,
          AIRiskScore: null,
          holderConcentration: {
            top1Percentage: 0, top1Address: null, top1Label: null,
            top1IsExchange: false, top1IsBlackhole: false,
            top10Percentage: 0, concentrationLevel: 'UNKNOWN', rugPullRisk: false
          }
        };
        try {
          await mongoService.saveToken(symbol.toUpperCase(), fallbackData, Date.now());
          console.log(`💾 Saved ${symbol} to MongoDB — category: undefined (no data)`);
          try { require('./categories').invalidateCategoriesCache(); } catch(e) {}
        } catch (mongoError) {
          console.log(`⚠️  MongoDB save failed (non-critical): ${mongoError.message}`);
        }
      }

      // Save full API response to file cache (only if success)
      if (result && result.success !== false) {
        await cacheService.setApiResponse(symbol, result);
      } else {
        // Clear any stale cache for failed results
        await cacheService.clearToken(symbol);
      }

    } catch (saveError) {
      console.error(`❌ Failed to save ${symbol} to MongoDB:`, saveError.message);
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

router.delete('/cache/clear/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    await cacheService.clearToken(symbol);
    res.json({ success: true, message: `Cache cleared for ${symbol}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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