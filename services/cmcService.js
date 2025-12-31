// services/cmcService.js - CoinMarketCap API service
const axios = require('axios');

class CMCService {
  constructor() {
    this.baseUrl = 'https://pro-api.coinmarketcap.com/v1';
    this.apiKey = process.env.CMC_API_KEY || '';
  }

  async getTokenInfo(contractAddress, network) {
    try {
      if (!this.apiKey) {
        console.warn('CMC API key not configured');
        return null;
      }

      const platformId = this.getPlatformId(network);
      const response = await axios.get(`${this.baseUrl}/cryptocurrency/info`, {
        headers: {
          'X-CMC_PRO_API_KEY': this.apiKey
        },
        params: {
          address: contractAddress
        },
        timeout: 10000
      });

      const data = response.data?.data?.[Object.keys(response.data.data)[0]];
      if (!data) return null;

      return {
        name: data.name,
        symbol: data.symbol,
        exchanges: this.extractExchanges(data),
        totalSupply: data.total_supply,
        marketCap: data.quote?.USD?.market_cap,
        verified: data.is_verified || false
      };
    } catch (error) {
      console.error('CMC API error:', error.message);
      return null;
    }
  }

  extractExchanges(data) {
    const exchanges = [];
    if (data.market_pairs) {
      data.market_pairs.forEach(pair => {
        if (pair.exchange && !exchanges.includes(pair.exchange.name)) {
          exchanges.push(pair.exchange.name);
        }
      });
    }
    return exchanges;
  }

  getPlatformId(network) {
    const platforms = {
      'bsc': 'binance-smart-chain',
      'eth': 'ethereum',
      'polygon': 'polygon-pos',
      'arbitrum': 'arbitrum-one',
      'avalanche': 'avalanche'
    };
    return platforms[network.toLowerCase()] || 'ethereum';
  }
}

module.exports = new CMCService();