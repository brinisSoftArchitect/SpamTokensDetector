// services/multiChainAnalyzer.js - Multi-chain token analysis
const tokenAnalyzer = require('./tokenAnalyzer');
const gateioService = require('./gateioService');
const nativeTokenDataService = require('./nativeTokenDataService');
const aiRiskAnalyzer = require('./aiRiskAnalyzer');

class MultiChainAnalyzer {
  async analyzeNativeToken(symbol) {
    const axios = require('axios');
    
    const nativeTokens = {
      'MON': {
        name: 'Monad',
        network: 'monad',
        isNative: true,
        explorer: 'https://explorer.monad.xyz',
        coingeckoId: 'monad-2'
      },
      'ETH': {
        name: 'Ethereum',
        network: 'eth',
        isNative: true,
        explorer: 'https://etherscan.io',
        coingeckoId: 'ethereum'
      },
      'BNB': {
        name: 'Binance Coin',
        network: 'bsc',
        isNative: true,
        explorer: 'https://bscscan.com',
        coingeckoId: 'binancecoin'
      },
      'MATIC': {
        name: 'Polygon',
        network: 'polygon',
        isNative: true,
        explorer: 'https://polygonscan.com',
        coingeckoId: 'matic-network'
      },
      'AVAX': {
        name: 'Avalanche',
        network: 'avalanche',
        isNative: true,
        explorer: 'https://snowtrace.io',
        coingeckoId: 'avalanche-2'
      },
      'FTM': {
        name: 'Fantom',
        network: 'fantom',
        isNative: true,
        explorer: 'https://ftmscan.com',
        coingeckoId: 'fantom'
      }
    };

    const upperSymbol = symbol.toUpperCase();
    const nativeInfo = nativeTokens[upperSymbol];

    if (nativeInfo) {
      console.log(`Detected native blockchain token: ${upperSymbol}`);
      
      const marketData = await nativeTokenDataService.fetchFromMultipleSources(upperSymbol, nativeInfo.coingeckoId);
      const exchanges = marketData.exchanges || [];
      
      const volumeToMarketCapRatio = (marketData.marketCapRaw && marketData.volume24hRaw) 
        ? (marketData.volume24hRaw / marketData.marketCapRaw) 
        : null;
      
      const gapHunterRisk = this.calculateNativeTokenRisk(marketData, volumeToMarketCapRatio);
      
      return {
        success: true,
        symbol: upperSymbol,
        isNativeToken: true,
        chainsFound: 1,
        tokenInfo: {
          name: nativeInfo.name,
          symbol: upperSymbol,
          network: nativeInfo.network,
          type: 'Native Blockchain Token',
          description: `${nativeInfo.name} is the native cryptocurrency of the ${nativeInfo.network} blockchain.`,
          verified: true
        },
        marketData: {
          marketCap: marketData.marketCap || 'N/A',
          marketCapRaw: marketData.marketCapRaw || null,
          volume24h: marketData.volume24h || 'N/A',
          volume24hRaw: marketData.volume24hRaw || null,
          volumeToMarketCapRatio: volumeToMarketCapRatio,
          volumeToMarketCapPercentage: volumeToMarketCapRatio ? `${(volumeToMarketCapRatio * 100).toFixed(2)}%` : null,
          priceChange24h: marketData.priceChange24h || null,
          currentPrice: marketData.currentPrice || null,
          liquidityRisk: this.assessNativeLiquidityRisk(marketData.marketCapRaw),
          volumeAnomalyDetected: volumeToMarketCapRatio ? (volumeToMarketCapRatio > 2 || volumeToMarketCapRatio < 0.001) : false,
          circulatingSupply: marketData.circulatingSupply ? marketData.circulatingSupply.toLocaleString('en-US') : null,
          totalSupply: marketData.totalSupply ? marketData.totalSupply.toLocaleString('en-US') : null,
          maxSupply: marketData.maxSupply ? marketData.maxSupply.toLocaleString('en-US') : null,
          ath: marketData.ath ? `${marketData.ath}` : null,
          athDate: marketData.athDate || null,
          atl: marketData.atl ? `${marketData.atl}` : null,
          atlDate: marketData.atlDate || null,
          marketCapRank: marketData.marketCapRank || null,
          fullyDilutedValuation: marketData.fullyDilutedValuation ? marketData.fullyDilutedValuation.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null
        },
        exchanges: exchanges,
        gapHunterBotRisk: gapHunterRisk,
        ownershipAnalysis: {
          note: 'Native blockchain tokens do not have traditional holder concentration metrics as they are distributed through mining/staking/validation mechanisms',
          isDecentralized: true,
          concentrationLevel: 'DECENTRALIZED'
        },
        explorer: nativeInfo.explorer,
        allExplorers: [{
          network: nativeInfo.network,
          url: nativeInfo.explorer
        }],
        dataSources: {
          coinGecko: marketData.fromCoinGecko || false,
          coinMarketCap: false,
          blockchain: false
        },
        summary: `${nativeInfo.name} (${upperSymbol}) is the native Layer 1 cryptocurrency of the ${nativeInfo.network} blockchain with ${exchanges.length > 0 ? exchanges.length + ' exchange listings' : 'limited exchange data'}.`
      };
    }

    return null;
  }

  async fetchNativeTokenMarketData(coingeckoId, symbol) {
    const axios = require('axios');
    
    try {
      console.log(`Fetching market data for ${symbol} (ID: ${coingeckoId})...`);
      
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coingeckoId}`, {
        params: {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const data = response.data;
      const marketData = data.market_data || {};
      
      const exchanges = [];
      if (data.tickers && Array.isArray(data.tickers)) {
        const seenExchanges = new Set();
        data.tickers.forEach(ticker => {
          if (ticker.market && ticker.market.name && !seenExchanges.has(ticker.market.name)) {
            seenExchanges.add(ticker.market.name);
            exchanges.push(ticker.market.name);
          }
        });
      }

      console.log(`✓ Market data retrieved for ${symbol}`);
      console.log(`  Market Cap: ${marketData.market_cap?.usd?.toLocaleString() || 'N/A'}`);
      console.log(`  24h Volume: ${marketData.total_volume?.usd?.toLocaleString() || 'N/A'}`);
      console.log(`  Exchanges: ${exchanges.length}`);

      return {
        marketCap: marketData.market_cap?.usd ? marketData.market_cap.usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
        marketCapRaw: marketData.market_cap?.usd || null,
        volume24h: marketData.total_volume?.usd ? marketData.total_volume.usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
        volume24hRaw: marketData.total_volume?.usd || null,
        priceChange24h: marketData.price_change_percentage_24h ? `${marketData.price_change_percentage_24h.toFixed(2)}%` : null,
        currentPrice: marketData.current_price?.usd ? `${marketData.current_price.usd}` : null,
        circulatingSupply: marketData.circulating_supply || null,
        totalSupply: marketData.total_supply || null,
        maxSupply: marketData.max_supply || null,
        ath: marketData.ath?.usd || null,
        athDate: marketData.ath_date?.usd || null,
        atl: marketData.atl?.usd || null,
        atlDate: marketData.atl_date?.usd || null,
        marketCapRank: marketData.market_cap_rank || null,
        exchanges: exchanges.slice(0, 20),
        fromCoinGecko: true
      };
    } catch (error) {
      console.log(`Failed to fetch market data for ${symbol}:`, error.message);
      return {
        marketCap: null,
        marketCapRaw: null,
        volume24h: null,
        volume24hRaw: null,
        priceChange24h: null,
        currentPrice: null,
        exchanges: [],
        fromCoinGecko: false
      };
    }
  }

  assessNativeLiquidityRisk(marketCap) {
    if (!marketCap) return 'UNKNOWN';
    if (marketCap < 10000) return 'CRITICAL';
    if (marketCap < 50000) return 'VERY_HIGH';
    if (marketCap < 100000) return 'HIGH';
    if (marketCap < 500000) return 'MODERATE';
    if (marketCap < 1000000) return 'LOW';
    if (marketCap < 10000000) return 'MINIMAL';
    return 'EXCELLENT';
  }

  calculateNativeTokenRisk(marketData, volumeToMarketCapRatio) {
    const marketCap = marketData.marketCapRaw || 0;
    const volume24h = marketData.volume24hRaw || 0;
    const volMcapPercentage = volumeToMarketCapRatio ? volumeToMarketCapRatio * 100 : 0;
    
    let M = 0;
    if (marketCap < 100000) {
      M = 100;
    } else if (marketCap < 1000000) {
      M = 70;
    } else if (marketCap < 10000000) {
      M = 40;
    } else if (marketCap < 100000000) {
      M = 20;
    } else {
      M = 0;
    }

    let V = 0;
    if (volume24h === 0 || volMcapPercentage === 0) {
      V = 100;
    } else if (volMcapPercentage < 0.1) {
      V = 90;
    } else if (volMcapPercentage < 1) {
      V = 60;
    } else if (volMcapPercentage < 5) {
      V = 30;
    } else if (volMcapPercentage >= 5 && volMcapPercentage <= 100) {
      V = 0;
    } else if (volMcapPercentage > 100 && volMcapPercentage <= 500) {
      V = 20;
    } else {
      V = 50;
    }

    const riskPercentage = (0.50 * M + 0.50 * V);
    const shouldSkip = riskPercentage >= 60;

    let recommendation = '';
    if (marketCap > 1000000000 && volMcapPercentage > 1) {
      recommendation = '✅ EXCELLENT - Major cryptocurrency with high liquidity';
    } else if (marketCap > 100000000 && volMcapPercentage > 1) {
      recommendation = '✅ GOOD - High liquidity native token';
    } else if (shouldSkip) {
      recommendation = '⚠️ CAUTION - Low liquidity for gap trading';
    } else {
      recommendation = '✅ ACCEPTABLE - Moderate liquidity';
    }

    return {
      riskPercentage: parseFloat(riskPercentage.toFixed(2)),
      shouldSkip: shouldSkip,
      hardSkip: false,
      hardSkipReasons: [],
      components: {
        M: { value: parseFloat(M.toFixed(2)), weight: '50%', description: 'Market cap risk' },
        V: { value: parseFloat(V.toFixed(2)), weight: '50%', description: 'Volume/MarketCap ratio' }
      },
      recommendation: recommendation,
      note: 'Native blockchain tokens have different risk profiles than smart contract tokens. This assessment focuses on liquidity and trading viability.'
    };
  }

  async analyzeBySymbol(symbol) {
    try {
      console.log(`\n=== Analyzing symbol: ${symbol} ===`);
      
      const nativeTokenAnalysis = await this.analyzeNativeToken(symbol);
      if (nativeTokenAnalysis) {
        return nativeTokenAnalysis;
      }
      
      let contracts = await gateioService.getTokenBySymbol(symbol);
      
      if (contracts.length === 0) {
        console.log(`No contracts found via Gate.io, trying CoinGecko...`);
        const coingeckoSearchService = require('./coingeckoSearchService');
        contracts = await coingeckoSearchService.searchBySymbol(symbol);
        
        if (contracts.length === 0) {
          contracts = await coingeckoSearchService.searchByMarketData(symbol);
        }
      }
      
      if (contracts.length === 0) {
        console.log(`No contracts found for ${symbol}`);
        
        return {
          success: false,
          error: `No contract addresses found for symbol: ${symbol}`,
          suggestion: 'Token may be a native blockchain token without a contract address, or not listed on supported platforms. Try using a contract address directly if this is an ERC-20/BEP-20 token.',
          symbol: symbol.toUpperCase(),
          searchedSources: ['Gate.io', 'CoinGecko', 'Native Token Database']
        };
      }
      
      console.log(`Found ${contracts.length} contract(s) for ${symbol}`);

      const analyses = await Promise.allSettled(
        contracts.map(contract => 
          tokenAnalyzer.analyzeToken(contract.address, contract.network)
        )
      );

      const explorersList = contracts.map(c => c.explorer);
      
      const results = contracts.map((contract, index) => {
        const analysis = analyses[index];
        return {
          network: contract.network,
          contractAddress: contract.address,
          explorer: contract.explorer,
          analysis: analysis.status === 'fulfilled' ? analysis.value : null,
          error: analysis.status === 'rejected' ? analysis.reason.message : null
        };
      });

      const globalScore = this.calculateGlobalScore(results);
      const overallRisk = this.determineOverallRisk(results, globalScore);

      const explorersData = contracts.map(c => ({
        network: c.network,
        url: c.explorer
      }));

      const gapHunterRisk = this.calculateGlobalGapHunterRisk(results);
      
      const firstAnalysis = results.find(r => r.analysis && r.analysis.gapHunterBotRisk);
      const aiRiskScore = firstAnalysis?.analysis?.gapHunterBotRisk?.AIriskScore || null;
      
      console.log('\n=== Adding AI Risk to Global Response ===');
      console.log('AI Risk Score:', aiRiskScore);
      
      return {
        success: true,
        symbol: symbol.toUpperCase(),
        chainsFound: contracts.length,
        globalSpamScore: globalScore.score,
        overallRisk: overallRisk,
        isSpamGlobally: globalScore.score >= 60,
        gapHunterBotRisk: {
          ...gapHunterRisk,
          AIriskScore: aiRiskScore
        },
        allExplorers: explorersData,
        chains: results,
        summary: this.generateSummary(results, globalScore)
      };
    } catch (error) {
      throw new Error(`Multi-chain analysis failed: ${error.message}`);
    }
  }

  calculateGlobalScore(results) {
    const validResults = results.filter(r => r.analysis && r.analysis.spamScore);
    
    if (validResults.length === 0) {
      return { score: 0, averageScore: 0, maxScore: 0, minScore: 0 };
    }

    const scores = validResults.map(r => r.analysis.spamScore);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const globalScore = Math.round((maxScore * 0.6) + (averageScore * 0.4));

    return {
      score: globalScore,
      averageScore: Math.round(averageScore),
      maxScore,
      minScore
    };
  }

  determineOverallRisk(results, globalScore) {
    const score = globalScore.score;
    const validResults = results.filter(r => r.analysis);
    
    if (validResults.length === 0) return 'UNKNOWN';

    const criticalCount = validResults.filter(r => r.analysis.riskLevel === 'CRITICAL').length;
    const highCount = validResults.filter(r => r.analysis.riskLevel === 'HIGH').length;
    
    if (criticalCount > 0 || score >= 80) return 'CRITICAL';
    if (highCount > validResults.length / 2 || score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  generateSummary(results, globalScore) {
    const validResults = results.filter(r => r.analysis);
    const spamChains = validResults.filter(r => r.analysis.isSpam).length;
    const totalChains = validResults.length;

    if (totalChains === 0) {
      return 'Unable to analyze token - no valid data retrieved.';
    }

    if (spamChains === 0) {
      return `Token appears legitimate across all ${totalChains} chain(s) analyzed with low risk indicators.`;
    }

    if (spamChains === totalChains) {
      return `WARNING: Token shows spam characteristics on ALL ${totalChains} chain(s) - high risk of scam.`;
    }

    return `Mixed risk profile: ${spamChains} of ${totalChains} chain(s) show spam indicators - proceed with caution.`;
  }

  calculateGlobalGapHunterRisk(results) {
    const validResults = results.filter(r => r.analysis && r.analysis.gapHunterBotRisk && !r.error);
    
    if (validResults.length === 0) {
      return {
        riskPercentage: 100,
        shouldSkip: true,
        hardSkip: true,
        hardSkipReasons: ['No valid analysis data available'],
        recommendation: '🛑 HARD SKIP - Insufficient data',
        chainsAnalyzed: 0
      };
    }

    const highestRisk = validResults.reduce((max, result) => {
      const risk = result.analysis.gapHunterBotRisk.riskPercentage;
      return risk > max ? risk : max;
    }, 0);

    const anyHardSkip = validResults.some(r => r.analysis.gapHunterBotRisk.hardSkip);
    const allHardSkipReasons = validResults
      .filter(r => r.analysis.gapHunterBotRisk.hardSkip)
      .flatMap(r => r.analysis.gapHunterBotRisk.hardSkipReasons);
    const uniqueHardSkipReasons = [...new Set(allHardSkipReasons)];

    const shouldSkip = highestRisk >= 60 || anyHardSkip;

    let recommendation = '';
    if (anyHardSkip) {
      recommendation = '🛑 HARD SKIP - Do not trade on any chain';
    } else if (shouldSkip) {
      recommendation = '🚫 SKIP - High risk for gap bot';
    } else if (highestRisk >= 40) {
      recommendation = '⚠️ CAUTION - Risky trade';
    } else {
      recommendation = '✅ ACCEPTABLE for gap bot';
    }

    return {
      riskPercentage: parseFloat(highestRisk.toFixed(2)),
      shouldSkip: shouldSkip,
      hardSkip: anyHardSkip,
      hardSkipReasons: uniqueHardSkipReasons,
      recommendation: recommendation,
      chainsAnalyzed: validResults.length,
      perChainRisks: validResults.map(r => ({
        network: r.network,
        riskPercentage: r.analysis.gapHunterBotRisk.riskPercentage,
        hardSkip: r.analysis.gapHunterBotRisk.hardSkip
      }))
    };
  }

  async analyzeMultipleChains(contractAddresses) {
    const analyses = await Promise.allSettled(
      contractAddresses.map(({ address, network }) => 
        tokenAnalyzer.analyzeToken(address, network)
      )
    );

    const results = contractAddresses.map((contract, index) => {
      const analysis = analyses[index];
      return {
        network: contract.network,
        contractAddress: contract.address,
        analysis: analysis.status === 'fulfilled' ? analysis.value : null,
        error: analysis.status === 'rejected' ? analysis.reason.message : null
      };
    });

    const globalScore = this.calculateGlobalScore(results);
    const overallRisk = this.determineOverallRisk(results, globalScore);

    return {
      success: true,
      chainsAnalyzed: contractAddresses.length,
      globalSpamScore: globalScore.score,
      overallRisk: overallRisk,
      isSpamGlobally: globalScore.score >= 60,
      chains: results,
      summary: this.generateSummary(results, globalScore)
    };
  }
}

module.exports = new MultiChainAnalyzer();