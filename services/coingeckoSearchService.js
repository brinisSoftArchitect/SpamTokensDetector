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

      const explorers = [];
      
      for (const [platform, address] of Object.entries(platforms)) {
        if (address && address !== '') {
          const network = this.mapPlatformToNetwork(platform);
          if (network) {
            explorers.push(this.getExplorerUrl(network, address));
            contracts.push({
              network: network,
              address: address,
              explorer: this.getExplorerUrl(network, address),
              allExplorers: explorers
            });
          }
        }
      }

      contracts.forEach(contract => {
        contract.allExplorers = [...explorers];
      });

      return contracts;
    } catch (error) {
      console.log(`Failed to get platforms for ${coinId}:`, error.message);
      return [];
    }
  }

  mapPlatformToNetwork(platform) {
    const mapping = {
      'binance-smart-chain': 'bsc',
      'ethereum': 'eth',
      'polygon-pos': 'polygon',
      'arbitrum-one': 'arbitrum',
      'avalanche': 'avalanche'
    };
    return mapping[platform] || null;
  }

  getExplorerUrl(network, address) {
    const explorers = {
      'bsc': `https://bscscan.com/token/${address}`,
      'eth': `https://etherscan.io/token/${address}`,
      'polygon': `https://polygonscan.com/token/${address}`,
      'arbitrum': `https://arbiscan.io/token/${address}`,
      'avalanche': `https://snowtrace.io/token/${address}`
    };
    return explorers[network] || '';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new CoingeckoSearchService();