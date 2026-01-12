// services/nativeTokenHandler.js - Handle native blockchain tokens (BTC, ETH, etc.)
const nativeTokenDataService = require('./nativeTokenDataService');
const { getGateioMultiChainInfo } = require('./gateioService');

class NativeTokenHandler {
  constructor() {
    this.nativeTokens = {
      'BTC': { name: 'Bitcoin', network: 'bitcoin', coingeckoId: 'bitcoin', explorer: 'https://mempool.space/' },
      'ETH': { name: 'Ethereum', network: 'eth', coingeckoId: 'ethereum', explorer: 'https://etherscan.io' },
      'BNB': { name: 'BNB', network: 'bsc', coingeckoId: 'binancecoin', explorer: 'https://bscscan.com' },
      'MATIC': { name: 'Polygon', network: 'polygon', coingeckoId: 'matic-network', explorer: 'https://polygonscan.com' },
      'AVAX': { name: 'Avalanche', network: 'avalanche', coingeckoId: 'avalanche-2', explorer: 'https://snowtrace.io' },
      'FTM': { name: 'Fantom', network: 'fantom', coingeckoId: 'fantom', explorer: 'https://ftmscan.com' },
      'ARB': { name: 'Arbitrum', network: 'arbitrum', coingeckoId: 'arbitrum', explorer: 'https://arbiscan.io' },
      'OP': { name: 'Optimism', network: 'optimism', coingeckoId: 'optimism', explorer: 'https://optimistic.etherscan.io' },
      'SOL': { name: 'Solana', network: 'solana', coingeckoId: 'solana', explorer: 'https://solscan.io' },
      'ADA': { name: 'Cardano', network: 'cardano', coingeckoId: 'cardano', explorer: 'https://cardanoscan.io' },
      'DOT': { name: 'Polkadot', network: 'polkadot', coingeckoId: 'polkadot', explorer: 'https://polkadot.subscan.io' },
      'KDA': { name: 'Kadena', network: 'kadena', coingeckoId: 'kadena', explorer: 'https://explorer.chainweb.com' },
      'TRX': { name: 'TRON', network: 'tron', coingeckoId: 'tron', explorer: 'https://tronscan.org' },
      'XRP': { name: 'Ripple', network: 'ripple', coingeckoId: 'ripple', explorer: 'https://xrpscan.com' },
      'LTC': { name: 'Litecoin', network: 'litecoin', coingeckoId: 'litecoin', explorer: 'https://blockchair.com/litecoin' },
      'BCH': { name: 'Bitcoin Cash', network: 'bitcoin-cash', coingeckoId: 'bitcoin-cash', explorer: 'https://blockchair.com/bitcoin-cash' },
      'XLM': { name: 'Stellar', network: 'stellar', coingeckoId: 'stellar', explorer: 'https://stellarchain.io' },
      'ATOM': { name: 'Cosmos', network: 'cosmos', coingeckoId: 'cosmos', explorer: 'https://www.mintscan.io/cosmos' },
      'ALGO': { name: 'Algorand', network: 'algorand', coingeckoId: 'algorand', explorer: 'https://algoexplorer.io' }
    };
  }

  isNativeToken(symbol) {
    return this.nativeTokens.hasOwnProperty(symbol.toUpperCase());
  }

  async analyzeNativeToken(symbol) {
    const upperSymbol = symbol.toUpperCase();
    
    if (!this.isNativeToken(upperSymbol)) {
      return null;
    }

    const tokenInfo = this.nativeTokens[upperSymbol];
    console.log(`\n=== Analyzing Native Token: ${upperSymbol} ===`);

    // Check if this token exists as wrapped versions on other chains
    const gateioChains = await getGateioMultiChainInfo(upperSymbol);
    const wrappedVersions = [];
    
    if (gateioChains && gateioChains.length > 0) {
      console.log(`Found ${gateioChains.length} chains for ${upperSymbol}:`);
      
      for (const chain of gateioChains) {
        if (chain.chain && chain.contract && chain.contract !== '0x0000000000000000000000000000000000000000') {
          console.log(`  - ${chain.chain}: ${chain.contract}`);
          wrappedVersions.push({
            network: chain.chain,
            contractAddress: chain.contract,
            isNative: chain.is_native || false
          });
        }
      }
    }

    // Fetch market data
    const marketData = await nativeTokenDataService.fetchFromMultipleSources(
      upperSymbol,
      tokenInfo.coingeckoId
    );

    // Calculate risk metrics
    const volumeToMarketCapRatio = (marketData.marketCapRaw && marketData.volume24hRaw)
      ? marketData.volume24hRaw / marketData.marketCapRaw
      : 0;

    const gapHunterRisk = this.calculateNativeTokenRisk(marketData, volumeToMarketCapRatio);

    return {
      success: true,
      symbol: upperSymbol,
      isNativeToken: true,
      chainsFound: wrappedVersions.length + 1,
      tokenInfo: {
        name: tokenInfo.name,
        symbol: upperSymbol,
        network: tokenInfo.network,
        type: 'Native Blockchain Token',
        description: `${tokenInfo.name} is the native cryptocurrency of the ${tokenInfo.network} blockchain.`,
        verified: true
      },
      marketData: {
        ...marketData,
        volumeToMarketCapRatio,
        volumeToMarketCapPercentage: volumeToMarketCapRatio ? `${(volumeToMarketCapRatio * 100).toFixed(2)}%` : null,
        liquidityRisk: this.assessLiquidityRisk(marketData.marketCapRaw),
        volumeAnomalyDetected: this.detectVolumeAnomaly(volumeToMarketCapRatio)
      },
      gapHunterBotRisk: gapHunterRisk,
      ownershipAnalysis: {
        note: 'Native blockchain tokens do not have traditional holder concentration metrics as they are distributed through mining/staking/validation mechanisms',
        isDecentralized: true,
        concentrationLevel: 'DECENTRALIZED',
        topOwnerPercentage: 0,
        top10Percentage: 0
      },
      holderConcentration: {
        top1Percentage: 0,
        top1Address: null,
        top1Label: null,
        top1IsExchange: false,
        top10Percentage: 0,
        rugPullRisk: false,
        concentrationLevel: 'DECENTRALIZED'
      },
      holdersSourceUrl: tokenInfo.explorer,
      explorer: tokenInfo.explorer,
      allExplorers: [
        { network: tokenInfo.network, url: tokenInfo.explorer },
        ...wrappedVersions.map(v => ({ network: v.network, url: this.getExplorerForNetwork(v.network) }))
      ],
      wrappedVersions,
      dataSources: {
        coinGecko: !!marketData.currentPrice,
        coinMarketCap: false,
        blockchain: false,
        ai: false
      },
      summary: `${tokenInfo.name} (${upperSymbol}) is the native Layer 1 cryptocurrency of the ${tokenInfo.network} blockchain with ${marketData.exchanges?.length || 0} exchange listings.`,
      blockchainDetails: null,
      aiEnhancedData: null
    };
  }

  calculateNativeTokenRisk(marketData, volumeToMarketCapRatio) {
    const marketCap = marketData.marketCapRaw || 0;
    const volMcapPercentage = volumeToMarketCapRatio * 100;

    let M = 0;
    if (marketCap < 50000) {
      M = 100;
    } else if (marketCap < 100000) {
      M = 80;
    } else if (marketCap < 500000) {
      M = 60;
    } else if (marketCap < 1000000) {
      M = 40;
    } else if (marketCap < 10000000) {
      M = 20;
    } else {
      M = 0;
    }

    let V = 0;
    if (volMcapPercentage >= 50 && volMcapPercentage <= 300) {
      V = 0;
    } else {
      V = Math.min(Math.abs(volMcapPercentage - 175) / 175 * 100, 100);
    }

    const riskPercentage = (0.50 * M) + (0.50 * V);

    let recommendation = '';
    if (marketCap > 1000000000) {
      recommendation = '✅ EXCELLENT - Major cryptocurrency with high liquidity';
    } else if (marketCap > 100000000) {
      recommendation = '✅ GOOD - Established cryptocurrency';
    } else if (riskPercentage >= 60) {
      recommendation = '⚠️ CAUTION - Lower liquidity native token';
    } else {
      recommendation = '✅ ACCEPTABLE - Moderate liquidity';
    }

    return {
      riskPercentage: parseFloat(riskPercentage.toFixed(2)),
      shouldSkip: false,
      hardSkip: false,
      hardSkipReasons: [],
      components: {
        M: { value: parseFloat(M.toFixed(2)), weight: '50%', description: 'Market cap risk' },
        V: { value: parseFloat(V.toFixed(2)), weight: '50%', description: 'Volume/MarketCap ratio' }
      },
      recommendation,
      note: 'Native blockchain tokens have different risk profiles than smart contract tokens. This assessment focuses on liquidity and trading viability.'
    };
  }

  assessLiquidityRisk(marketCap) {
    if (!marketCap) return 'UNKNOWN';
    if (marketCap > 10000000000) return 'EXCELLENT';
    if (marketCap > 1000000000) return 'VERY_GOOD';
    if (marketCap > 100000000) return 'GOOD';
    if (marketCap > 10000000) return 'MODERATE';
    if (marketCap > 1000000) return 'LOW';
    return 'MINIMAL';
  }

  detectVolumeAnomaly(volumeToMarketCapRatio) {
    if (!volumeToMarketCapRatio) return false;
    if (volumeToMarketCapRatio > 2) return true;
    if (volumeToMarketCapRatio < 0.001) return true;
    return false;
  }

  getExplorerForNetwork(network) {
    const explorers = {
      'ETH': 'https://etherscan.io',
      'BSC': 'https://bscscan.com',
      'POLYGON': 'https://polygonscan.com',
      'ARBITRUM': 'https://arbiscan.io',
      'AVALANCHE': 'https://snowtrace.io',
      'OPTIMISM': 'https://optimistic.etherscan.io',
      'BASE': 'https://basescan.org',
      'FANTOM': 'https://ftmscan.com'
    };
    return explorers[network.toUpperCase()] || 'https://etherscan.io';
  }
}

module.exports = new NativeTokenHandler();