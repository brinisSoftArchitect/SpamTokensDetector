// services/coingeckoSearchService.js - CoinGecko search by symbol
const axios = require('axios');

class CoingeckoSearchService {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async searchBySymbol(symbol) {
    try {
      console.log(`Searching CoinGecko for symbol: ${symbol}`);
      
      const directResult = await this.searchByMarketData(symbol);
      if (directResult.length > 0) {
        return directResult;
      }
      
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { query: symbol },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const coins = response.data?.coins || [];
      console.log(`Found ${coins.length} results for ${symbol}`);
      
      const exactMatch = coins.find(coin => 
        coin.symbol?.toLowerCase() === symbol.toLowerCase()
      );

      if (exactMatch) {
        console.log(`Exact match found: ${exactMatch.id}`);
        return await this.getTokenPlatforms(exactMatch.id, symbol);
      }

      if (coins.length > 0) {
        console.log(`Using first result: ${coins[0].id}`);
        return await this.getTokenPlatforms(coins[0].id, symbol);
      }

      return [];
    } catch (error) {
      console.log(`CoinGecko search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  async getTokenPlatforms(coinId, symbol = '') {
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

      console.log(`Platforms for ${coinId}:`, Object.keys(platforms));
      
      for (const [platform, address] of Object.entries(platforms)) {
        if (address && address !== '') {
          const network = this.mapPlatformToNetwork(platform);
          if (network) {
            contracts.push({
              network: network,
              address: address,
              explorer: this.getExplorerUrl(network, address)
            });
            console.log(`  ✓ ${platform} -> ${network}: ${address}`);
          } else {
            console.log(`  ✗ Unknown platform: ${platform}`);
          }
        }
      }
      
      console.log(`Found ${contracts.length} contract(s) for ${coinId}`);
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
      console.log(`Trying direct coin ID lookup for ${symbol}`);
      
      const commonIds = {
        'DVI': 'dvision-network',
        'WETH': 'weth',
        'USDT': 'tether',
        'USDC': 'usd-coin',
        'DAI': 'dai',
        'BTC': 'bitcoin',
        'WBTC': 'wrapped-bitcoin',
        'ETH': 'ethereum',
        'BNB': 'binancecoin',
        'MATIC': 'matic-network',
        'AVAX': 'avalanche-2',
        'FTM': 'fantom',
        'SOL': 'solana',
        'ADA': 'cardano',
        'DOT': 'polkadot',
        'LINK': 'chainlink',
        'UNI': 'uniswap',
        'CAKE': 'pancakeswap-token',
        'MON': 'monad-2',
        'BUSD': 'binance-usd',
        'SHIB': 'shiba-inu',
        'DOGE': 'dogecoin'
      };

      const directId = commonIds[symbol.toUpperCase()];
      if (directId) {
        console.log(`Using direct ID mapping: ${symbol} -> ${directId}`);
        const contracts = await this.getTokenPlatforms(directId, symbol);
        if (contracts.length > 0) {
          return contracts;
        }
        console.log(`No contracts found for ${directId}, continuing search...`);
      }

      console.log(`Trying coins/markets API for ${symbol}`);
      const marketResponse = await axios.get(`${this.baseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          sparkline: false
        },
        timeout: 20000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const coins = marketResponse.data || [];
      const matchingCoin = coins.find(coin => 
        coin.symbol?.toLowerCase() === symbol.toLowerCase()
      );

      if (matchingCoin) {
        console.log(`Found ${symbol} in markets: ${matchingCoin.id}`);
        await this.sleep(1000);
        return await this.getTokenPlatforms(matchingCoin.id, symbol);
      }

      console.log(`${symbol} not found in markets`);
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