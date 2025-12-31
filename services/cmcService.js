// services/cmcService.js - CoinMarketCap API service
const axios = require('axios');

class CMCService {
  constructor() {
    this.baseUrl = 'https://pro-api.coinmarketcap.com/v1';
    this.apiKey = process.env.CMC_API_KEY || '';
  }

  async getTokenInfo(contractAddress, network) {
    try {
      const platformId = this.getPlatformId(network);
      const searchUrl = `https://coinmarketcap.com/currencies/${contractAddress}/`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const html = response.data;
      const name = this.extractFromHtml(html, /<h1[^>]*>([^<]+)<\/h1>/);
      const symbol = this.extractFromHtml(html, /<span[^>]*>\(([^)]+)\)<\/span>/);
      
      return {
        name: name || null,
        symbol: symbol || null,
        exchanges: [],
        totalSupply: null,
        marketCap: null,
        verified: false
      };
    } catch (error) {
      console.log('CMC scraping skipped:', error.message);
      return null;
    }
  }

  extractFromHtml(html, regex) {
    const match = html.match(regex);
    return match ? match[1].trim() : null;
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
      'avalanche': 'avalanche',
      'monad': 'monad',
      'base': 'base',
      'optimism': 'optimistic-ethereum',
      'fantom': 'fantom'
    };
    return platforms[network.toLowerCase()] || 'ethereum';
  }
}

module.exports = new CMCService();