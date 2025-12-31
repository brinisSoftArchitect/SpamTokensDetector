// services/coingeckoService.js - CoinGecko API service
const axios = require('axios');

class CoingeckoService {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async getTokenInfo(contractAddress, network) {
    try {
      const platformId = this.getPlatformId(network);
      const response = await axios.get(
        `${this.baseUrl}/coins/${platformId}/contract/${contractAddress}`,
        { 
          timeout: 15000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      const data = response.data;
      return {
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
        exchanges: this.extractExchanges(data),
        totalSupply: data.market_data?.total_supply,
        marketCap: data.market_data?.market_cap?.usd,
        volume24h: data.market_data?.total_volume?.usd,
        priceChange24h: data.market_data?.price_change_percentage_24h,
        currentPrice: data.market_data?.current_price?.usd,
        verified: data.community_data?.twitter_followers > 1000
      };
    } catch (error) {
      if (error.response?.status === 429) {
        console.log('CoinGecko rate limit, waiting...');
        await this.sleep(2000);
      }
      console.log('CoinGecko API unavailable:', error.message);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  extractExchanges(data) {
    const exchanges = [];
    if (data.tickers) {
      data.tickers.forEach(ticker => {
        if (ticker.market && !exchanges.includes(ticker.market.name)) {
          exchanges.push(ticker.market.name);
        }
      });
    }
    return exchanges.slice(0, 20);
  }

  getPlatformId(network) {
    const platforms = {
      'bsc': 'binance-smart-chain',
      'eth': 'ethereum',
      'polygon': 'polygon-pos',
      'arbitrum': 'arbitrum-one',
      'avalanche': 'avalanche',
      'fantom': 'fantom',
      'optimism': 'optimistic-ethereum',
      'monad': 'monad',
      'base': 'base',
      'optimism': 'optimistic-ethereum'
    };
    return platforms[network.toLowerCase()] || 'ethereum';
  }
}

module.exports = new CoingeckoService();