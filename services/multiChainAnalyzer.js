// services/multiChainAnalyzer.js - Multi-chain token analysis
const tokenAnalyzer = require('./tokenAnalyzer');
const gateioService = require('./gateioService');

class MultiChainAnalyzer {
  async analyzeNativeToken(symbol) {
    const nativeTokens = {
      'MON': {
        name: 'Monad',
        network: 'monad',
        isNative: true,
        explorer: 'https://explorer.monad.xyz'
      },
      'ETH': {
        name: 'Ethereum',
        network: 'eth',
        isNative: true,
        explorer: 'https://etherscan.io'
      },
      'BNB': {
        name: 'Binance Coin',
        network: 'bsc',
        isNative: true,
        explorer: 'https://bscscan.com'
      },
      'MATIC': {
        name: 'Polygon',
        network: 'polygon',
        isNative: true,
        explorer: 'https://polygonscan.com'
      },
      'AVAX': {
        name: 'Avalanche',
        network: 'avalanche',
        isNative: true,
        explorer: 'https://snowtrace.io'
      },
      'FTM': {
        name: 'Fantom',
        network: 'fantom',
        isNative: true,
        explorer: 'https://ftmscan.com'
      }
    };

    const upperSymbol = symbol.toUpperCase();
    const nativeInfo = nativeTokens[upperSymbol];

    if (nativeInfo) {
      console.log(`Detected native blockchain token: ${upperSymbol}`);
      return {
        success: true,
        symbol: upperSymbol,
        isNativeToken: true,
        tokenInfo: {
          name: nativeInfo.name,
          symbol: upperSymbol,
          network: nativeInfo.network,
          type: 'Native Blockchain Token',
          description: `${nativeInfo.name} is the native cryptocurrency of the ${nativeInfo.network} blockchain and does not have a contract address.`
        },
        gapHunterBotRisk: {
          riskPercentage: 0,
          shouldSkip: false,
          hardSkip: false,
          hardSkipReasons: [],
          recommendation: '✅ Native blockchain token - not applicable for gap trading',
          note: 'Native tokens are the base currency of their blockchain and cannot be analyzed like smart contract tokens'
        },
        explorer: nativeInfo.explorer,
        note: 'This is a native blockchain token (Layer 1) and does not have holder distribution or contract verification metrics. It cannot be analyzed for spam/scam characteristics as it is the foundational currency of its blockchain.'
      };
    }

    return null;
  }

  async analyzeBySymbol(symbol) {
    try {
      console.log(`\n=== Analyzing symbol: ${symbol} ===`);
      const contracts = await gateioService.getTokenBySymbol(symbol);
      
      if (contracts.length === 0) {
        console.log(`No contracts found for ${symbol}`);
        
        const nativeTokenAnalysis = await this.analyzeNativeToken(symbol);
        if (nativeTokenAnalysis) {
          return nativeTokenAnalysis;
        }
        
        return {
          success: false,
          error: `No contract addresses found for symbol: ${symbol}`,
          suggestion: 'Token may be a native blockchain token without a contract address, or not listed on supported platforms. Try using a contract address directly if this is an ERC-20/BEP-20 token.',
          symbol: symbol.toUpperCase(),
          searchedSources: ['Gate.io', 'CoinGecko', 'Native Token Database']
        };
      }

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
      
      return {
        success: true,
        symbol: symbol.toUpperCase(),
        chainsFound: contracts.length,
        globalSpamScore: globalScore.score,
        overallRisk: overallRisk,
        isSpamGlobally: globalScore.score >= 60,
        gapHunterBotRisk: gapHunterRisk,
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