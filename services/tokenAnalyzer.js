// services/tokenAnalyzer.js - Main token analysis service
const cmcService = require('./cmcService');
const coingeckoService = require('./coingeckoService');
const blockchainService = require('./blockchainService');
const aiExplainer = require('./aiExplainer');
const spamDetector = require('./spamDetector');

class TokenAnalyzer {
  async analyzeToken(contractAddress, network) {
    try {
      const [cmcData, coingeckoData, blockchainData] = await Promise.allSettled([
        cmcService.getTokenInfo(contractAddress, network),
        coingeckoService.getTokenInfo(contractAddress, network),
        blockchainService.getTokenDetails(contractAddress, network)
      ]);

      const tokenData = this.mergeTokenData(
        cmcData.status === 'fulfilled' ? cmcData.value : null,
        coingeckoData.status === 'fulfilled' ? coingeckoData.value : null,
        blockchainData.status === 'fulfilled' ? blockchainData.value : null
      );

      const ownershipAnalysis = this.analyzeOwnership(tokenData);
      const spamAnalysis = spamDetector.calculateSpamScore(tokenData, ownershipAnalysis);
      const spamScore = spamAnalysis.score;
      const aiExplanation = await aiExplainer.explainSpamReason(tokenData, ownershipAnalysis, spamScore);

      return {
        isSpam: spamScore >= 60,
        spamScore,
        riskLevel: spamAnalysis.risk,
        reasons: spamAnalysis.reasons,
        token: {
          name: tokenData.name,
          symbol: tokenData.symbol,
          contractAddress,
          network
        },
        exchanges: tokenData.exchanges || [],
        ownershipAnalysis,
        aiExplanation,
        dataSources: {
          coinMarketCap: cmcData.status === 'fulfilled',
          coinGecko: coingeckoData.status === 'fulfilled',
          blockchain: blockchainData.status === 'fulfilled'
        }
      };
    } catch (error) {
      throw new Error(`Token analysis failed: ${error.message}`);
    }
  }

  mergeTokenData(cmcData, coingeckoData, blockchainData) {
    return {
      name: cmcData?.name || coingeckoData?.name || blockchainData?.name || 'Unknown',
      symbol: cmcData?.symbol || coingeckoData?.symbol || blockchainData?.symbol || 'UNKNOWN',
      exchanges: this.mergeExchanges(cmcData, coingeckoData),
      holders: blockchainData?.holders || [],
      totalSupply: blockchainData?.totalSupply || cmcData?.totalSupply || coingeckoData?.totalSupply,
      marketCap: cmcData?.marketCap || coingeckoData?.marketCap,
      liquidity: blockchainData?.liquidity,
      creatorAddress: blockchainData?.creatorAddress,
      verified: cmcData?.verified || coingeckoData?.verified || false
    };
  }

  mergeExchanges(cmcData, coingeckoData) {
    const exchanges = new Set();
    if (cmcData?.exchanges) cmcData.exchanges.forEach(ex => exchanges.add(ex));
    if (coingeckoData?.exchanges) coingeckoData.exchanges.forEach(ex => exchanges.add(ex));
    return Array.from(exchanges);
  }

  analyzeOwnership(tokenData) {
    if (!tokenData.holders || tokenData.holders.length === 0) {
      return {
        topOwnerPercentage: 0,
        topOwnerAddress: null,
        isExchange: false,
        concentrated: false
      };
    }

    const topHolder = tokenData.holders[0];
    const isKnownExchange = this.isExchangeAddress(topHolder.address, tokenData.exchanges);

    return {
      topOwnerPercentage: topHolder.percentage || 0,
      topOwnerAddress: topHolder.address,
      isExchange: isKnownExchange,
      concentrated: topHolder.percentage > 50,
      top10Percentage: tokenData.holders.slice(0, 10).reduce((sum, h) => sum + (h.percentage || 0), 0)
    };
  }

  isExchangeAddress(address, exchanges) {
    const knownExchanges = ['binance', 'coinbase', 'kraken', 'okx', 'huobi', 'kucoin', 'gate'];
    return exchanges.some(ex => knownExchanges.some(known => ex.toLowerCase().includes(known)));
  }
}

module.exports = new TokenAnalyzer();