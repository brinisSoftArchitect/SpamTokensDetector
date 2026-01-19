// services/coingeckoService.js - CoinGecko API service
const axios = require('axios');

class CoingeckoService {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  platformToNetwork = {
    'ethereum': 'eth',
    'binance-smart-chain': 'bsc',
    'polygon-pos': 'polygon',
    'arbitrum-one': 'arbitrum',
    'avalanche': 'avalanche',
    'base': 'base',
    'optimistic-ethereum': 'optimism',
    'fantom': 'fantom',
    'solana': 'solana'
  };

  async getTokenInfo(contractAddress, network) {
    try {
      const platformId = this.getPlatformId(network);
      const response = await this.retryWithBackoff(async () => {
        return await axios.get(
          `${this.baseUrl}/coins/${platformId}/contract/${contractAddress}`,
          { 
            timeout: 15000,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0'
            }
          }
        );
      }, `getTokenInfo for ${contractAddress}`);

      const data = response.data;
      return {
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
        exchanges: this.extractExchanges(data),
        totalSupply: data.market_data?.total_supply,
        decimals: data.detail_platforms?.[platformId]?.decimal_place || 18,
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

  async retryWithBackoff(fn, operationName, maxAttempts = 5) {
    let attempts = 0;
    const baseDelay = 3000;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Attempting ${operationName} (${attempts}/${maxAttempts})...`);
        return await fn();
      } catch (error) {
        if (error.response && error.response.status === 429) {
          if (attempts < maxAttempts) {
            const delay = baseDelay * Math.pow(7, attempts - 1);
            console.log(`⚠️ Rate limit hit for ${operationName}. Waiting ${delay}ms before retry...`);
            await this.sleep(delay);
            continue;
          } else {
            console.log(`❌ Failed ${operationName} after ${maxAttempts} attempts due to rate limit`);
            throw error;
          }
        }
        throw error;
      }
    }
    throw new Error(`Failed ${operationName} after ${maxAttempts} attempts`);
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
      'solana': 'solana'
    };
    return platforms[network.toLowerCase()] || 'ethereum';
  }

  async searchTokenBySymbol(symbol) {
    try {
      console.log(`Searching CoinGecko for symbol: ${symbol}`);
      
      console.log(`Trying direct coin ID lookup for ${symbol}`);
      const coinIdLower = symbol.toLowerCase();
      try {
        const directResponse = await this.retryWithBackoff(async () => {
          return await axios.get(`${this.baseUrl}/coins/${coinIdLower}`, {
            timeout: 15000,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
        }, `direct coin lookup for ${symbol}`);
        
        if (directResponse.data) {
          return await this.extractContractsFromCoinData(directResponse.data);
        }
      } catch (directError) {
        console.log(`Direct lookup failed: ${directError.message}`);
      }

      console.log(`Trying coins/markets API for ${symbol}`);
      try {
        const marketsResponse = await this.retryWithBackoff(async () => {
          return await axios.get(`${this.baseUrl}/coins/markets`, {
            params: {
              vs_currency: 'usd',
              ids: coinIdLower,
              order: 'market_cap_desc',
              per_page: 1,
              page: 1
            },
            timeout: 15000
          });
        }, `market data search for ${symbol}`);

        if (marketsResponse.data && marketsResponse.data.length > 0) {
          const coinId = marketsResponse.data[0].id;
          const coinResponse = await this.retryWithBackoff(async () => {
            return await axios.get(`${this.baseUrl}/coins/${coinId}`);
          }, `get coin details for ${coinId}`);
          
          return await this.extractContractsFromCoinData(coinResponse.data);
        } else {
          console.log(`${symbol} not found in markets`);
        }
      } catch (marketError) {
        console.log(`Markets API failed: ${marketError.message}`);
      }

      console.log(`Attempting search for ${symbol} (1/5)...`);
      const searchResponse = await this.retryWithBackoff(async () => {
        return await axios.get(`${this.baseUrl}/search`, {
          params: { query: symbol },
          timeout: 15000
        });
      }, `search for ${symbol}`);

      if (searchResponse.data && searchResponse.data.coins && searchResponse.data.coins.length > 0) {
        console.log(`Found ${searchResponse.data.coins.length} results for ${symbol}`);
        
        const exactMatch = searchResponse.data.coins.find(
          coin => coin.symbol?.toLowerCase() === symbol.toLowerCase()
        );
        
        const coinToUse = exactMatch || searchResponse.data.coins[0];
        console.log(`${exactMatch ? 'Exact match found' : 'Using first result'}: ${coinToUse.id}`);
        
        console.log(`Attempting get platforms for ${coinToUse.id} (1/5)...`);
        const coinResponse = await this.retryWithBackoff(async () => {
          return await axios.get(`${this.baseUrl}/coins/${coinToUse.id}`);
        }, `get platforms for ${coinToUse.id}`);
        
        return await this.extractContractsFromCoinData(coinResponse.data);
      }
      
      console.log(`No results found for ${symbol}`);
      return [];
    } catch (error) {
      console.log(`CoinGecko search error for ${symbol}:`, error.message);
      return [];
    }
  }

  async extractContractsFromCoinData(coinData) {
    const coinId = coinData.id;
    const coinName = coinData.name;
    
    if (coinData.asset_platform_id === null && coinData.platforms) {
      console.log(`${coinName} is a native blockchain token`);
    }
    
    const blockchainLinks = [];
    if (coinData.links && coinData.links.blockchain_site) {
      coinData.links.blockchain_site.forEach(link => {
        if (link && link.trim() !== '') {
          blockchainLinks.push(link);
        }
      });
    }
    
    if (blockchainLinks.length > 0) {
      console.log(`✅ CoinGecko has ${blockchainLinks.length} blockchain explorer link(s) for ${coinId}:`);
      blockchainLinks.forEach(link => console.log(`   - ${link}`));
    }
    
    const platforms = coinData.platforms || {};
    console.log(`Platforms for ${coinId}:`, Object.keys(platforms));
    
    const contracts = [];
    
    for (const [platform, address] of Object.entries(platforms)) {
      if (address) {
        if (platform === 'solana') {
          contracts.push({ network: 'solana', address });
          console.log(`  ✓ ${platform}: ${address} → solana`);
        } else if (this.isValidEvmAddress(address)) {
          const network = this.platformToNetwork[platform];
          if (network) {
            contracts.push({ network, address });
            console.log(`  ✓ ${platform}: ${address} → ${network}`);
          } else {
            console.log(`  ✗ Unknown platform: ${platform}`);
          }
        }
      }
    }
    
    console.log(`Found ${contracts.length} contract(s) for ${coinId}`);
    return contracts;
  }

  isValidEvmAddress(address) {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

module.exports = new CoingeckoService();