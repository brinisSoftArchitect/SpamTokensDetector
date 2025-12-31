// services/multiChainAnalyzer.js - Multi-chain token analysis
const tokenAnalyzer = require('./tokenAnalyzer');
const gateioService = require('./gateioService');

class MultiChainAnalyzer {
  async analyzeBySymbol(symbol) {
    try {
      const contracts = await gateioService.getTokenBySymbol(symbol);
      
      if (contracts.length === 0) {
        return {
          success: false,
          error: `No contract addresses found for symbol: ${symbol}`,
          suggestion: 'Try using the contract address directly',
          symbol: symbol.toUpperCase()
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

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        chainsFound: contracts.length,
        globalSpamScore: globalScore.score,
        overallRisk: overallRisk,
        isSpamGlobally: globalScore.score >= 60,
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