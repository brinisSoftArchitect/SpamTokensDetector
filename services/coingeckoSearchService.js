// services/coingeckoSearchService.js - CoinGecko search by symbol
const axios = require('axios');

class CoingeckoSearchService {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async searchBySymbol(symbol) {
    try {
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { query: symbol },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const coins = response.data?.coins || [];
      const exactMatch = coins.find(coin => 
        coin.symbol?.toLowerCase() === symbol.toLowerCase()
      );

      if (exactMatch) {
        return await this.getTokenPlatforms(exactMatch.id);
      }

      if (coins.length > 0) {
        return await this.getTokenPlatforms(coins[0].id);
      }

      return [];
    } catch (error) {
      console.log(`CoinGecko search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  async getTokenPlatforms(coinId) {
    try {
      await this.sleep(1000);
      
      const response = await axios.get(`${this.baseUrl}/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const platforms = response.data?.platforms || {};
      const contracts = [];

      console.log('Available platforms:', Object.keys(platforms));
      
      for (const [platform, address] of Object.entries(platforms)) {
        console.log(`Processing platform: ${platform} -> ${address}`);
        if (address && address !== '') {
          const network = this.mapPlatformToNetwork(platform);
          if (network) {
            contracts.push({
              network: network,
              address: address,
              explorer: this.getExplorerUrl(network, address)
            });
            console.log(`  ✓ Mapped to ${network}`);
          } else {
            console.log(`  ✗ No mapping for platform: ${platform}`);
          }
        }
      }
      
      console.log(`Found ${contracts.length} contracts for coin ${coinId}`);

      return contracts;
    } catch (error) {
      console.log(`Failed to get platforms for ${coinId}:`, error.message);
      return [];
    }
  }

  mapPlatformToNetwork(platform) {
    const mapping = {
      'binance-smart-chain': 'bsc',
      'binancecoin': 'bsc',
      'bsc': 'bsc',
      'ethereum': 'eth',
      'polygon-pos': 'polygon',
      'matic-network': 'polygon',
      'arbitrum-one': 'arbitrum',
      'arbitrum': 'arbitrum',
      'avalanche': 'avalanche',
      'avalanche-2': 'avalanche',
      'optimistic-ethereum': 'optimism',
      'optimism': 'optimism',
      'monad': 'monad',
      'base': 'base',
      'fantom': 'fantom'
    };
    
    const normalized = platform.toLowerCase().replace(/[\s-_]/g, '');
    
    for (const [key, value] of Object.entries(mapping)) {
      if (key.replace(/[\s-_]/g, '') === normalized) {
        return value;
      }
    }
    
    return mapping[platform] || null;
  }

  getExplorerUrl(network, address) {
    const explorers = {
      'bsc': `https://bscscan.com/token/${address}`,
      'eth': `https://etherscan.io/token/${address}`,
      'polygon': `https://polygonscan.com/token/${address}`,
      'arbitrum': `https://arbiscan.io/token/${address}`,
      'avalanche': `https://snowtrace.io/token/${address}`,
      'monad': `https://explorer.monad.xyz/token/${address}`,
      'base': `https://basescan.org/token/${address}`,
      'optimism': `https://optimistic.etherscan.io/token/${address}`,
      'fantom': `https://ftmscan.com/token/${address}`
    };
    return explorers[network] || '';
  }

  checkForNativeToken(coinData, symbol) {
    if (!coinData) return null;
    
    const nativeTokens = {
      'BTC': { network: 'btc', address: 'native', explorer: 'https://blockchain.com' },
      'ETH': { network: 'eth', address: 'native', explorer: 'https://etherscan.io' },
      'BNB': { network: 'bsc', address: 'native', explorer: 'https://bscscan.com' },
      'MATIC': { network: 'polygon', address: 'native', explorer: 'https://polygonscan.com' },
      'AVAX': { network: 'avalanche', address: 'native', explorer: 'https://snowtrace.io' },
      'FTM': { network: 'fantom', address: 'native', explorer: 'https://ftmscan.com' },
      'MON': { network: 'monad', address: 'native', explorer: 'https://explorer.monad.xyz' }
    };
    
    const upperSymbol = symbol.toUpperCase();
    if (nativeTokens[upperSymbol]) {
      console.log(`Detected native token: ${upperSymbol}`);
      return nativeTokens[upperSymbol];
    }
    
    return null;
  }

  async searchByMarketData(symbol) {
    try {
      console.log(`Trying market data search for ${symbol}`);
      const response = await axios.get(`${this.baseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          symbols: symbol.toLowerCase(),
          order: 'market_cap_desc',
          per_page: 10,
          page: 1,
          sparkline: false
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (response.data && response.data.length > 0) {
        const coin = response.data[0];
        console.log(`Found via market data: ${coin.id}`);
        await this.sleep(1000);
        return await this.getTokenPlatforms(coin.id, symbol);
      }

      return [];
    } catch (error) {
      console.log(`Market data search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new CoingeckoSearchService();