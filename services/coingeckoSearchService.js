// services/coingeckoSearchService.js - CoinGecko search by symbol
const axios = require('axios');
const contractCache = require('./contractCache');

class CoingeckoSearchService {
  constructor() {
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async searchBySymbol(symbol) {
    // Check permanent cache first - contract addresses never change
    const cached = contractCache.get(symbol);
    if (cached) return cached;

    try {
      console.log(`Searching CoinGecko for symbol: ${symbol}`);

      // Try multiple sources in parallel for speed
      const contracts = await this.searchAllSources(symbol);

      if (contracts.length > 0) {
        contractCache.set(symbol, contracts);
      }
      return contracts;
    } catch (error) {
      console.log(`CoinGecko search failed for ${symbol}:`, error.message);
      return [];
    }
  }

  async searchAllSources(symbol) {
    // Try sources in order, stop as soon as one succeeds
    const sources = [
      () => this.searchCoinGeckoSearch(symbol),  // most accurate - exact symbol match
      () => this.searchCoinGeckoMarkets(symbol),  // broad market search
      () => this.searchCoinPaprika(symbol),        // fallback
    ];

    for (const source of sources) {
      try {
        const result = await source();
        if (result && result.length > 0) return result;
      } catch (e) {
        // try next source
      }
    }
    return [];
  }

  async searchCoinGeckoMarkets(symbol) {
    // Search across multiple pages to cover more tokens
    for (let page = 1; page <= 4; page++) {
      const response = await axios.get(`${this.baseUrl}/coins/markets`, {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 250, page, sparkline: false },
        timeout: 10000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      const coins = response.data || [];
      const match = coins.find(c => c.symbol?.toLowerCase() === symbol.toLowerCase());
      if (match) {
        console.log(`Found ${symbol} in markets page ${page}: ${match.id}`);
        return await this.getTokenPlatformsOnce(match.id);
      }
    }
    return [];
  }

  async searchCoinPaprika(symbol) {
    // CoinPaprika is free, no rate limit, no API key needed
    console.log(`[CoinPaprika] Searching for ${symbol}...`);
    const response = await axios.get(`https://api.coinpaprika.com/v1/search?q=${symbol}&c=currencies&limit=10`, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });
    const currencies = response.data?.currencies || [];
    const match = currencies.find(c => c.symbol?.toLowerCase() === symbol.toLowerCase());
    if (!match) return [];

    console.log(`[CoinPaprika] Found ${symbol}: ${match.id}`);
    // Get contract addresses from CoinPaprika
    const detail = await axios.get(`https://api.coinpaprika.com/v1/coins/${match.id}`, {
      timeout: 10000
    });
    const contracts = [];
    const platforms = detail.data?.contracts || [];
    for (const p of platforms) {
      const network = this.mapPlatformToNetwork(p.type?.toLowerCase() || '');
      if (network && p.contract) {
        contracts.push({
          network,
          address: p.contract,
          explorer: this.getExplorerUrl(network, p.contract)
        });
        console.log(`[CoinPaprika] ${network}: ${p.contract}`);
      }
    }
    return contracts;
  }

  async searchCoinGeckoSearch(symbol) {
    // Last resort - CoinGecko /search (can be rate limited)
    const response = await axios.get(`${this.baseUrl}/search`, {
      params: { query: symbol },
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    const coins = response.data?.coins || [];
    console.log(`Found ${coins.length} results for ${symbol}`);
    // Prefer exact symbol match with highest market cap rank
    const exactMatches = coins.filter(c => c.symbol?.toLowerCase() === symbol.toLowerCase());
    if (exactMatches.length === 0) return [];
    // Sort by market_cap_rank ascending (lower rank = bigger coin)
    exactMatches.sort((a, b) => (a.market_cap_rank || 9999) - (b.market_cap_rank || 9999));
    const match = exactMatches[0];
    return await this.getTokenPlatformsOnce(match.id);
  }

  async getTokenPlatformsOnce(coinId) {
    // Single attempt, no retry loop - fail fast
    try {
      const response = await axios.get(`${this.baseUrl}/coins/${coinId}`, {
        params: { localization: false, tickers: false, market_data: false, community_data: false, developer_data: false },
        timeout: 10000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      const platforms = response.data?.platforms || {};
      const contracts = [];
      for (const [platform, address] of Object.entries(platforms)) {
        if (address && address !== '') {
          const network = this.mapPlatformToNetwork(platform);
          if (network) {
            contracts.push({ network, address, explorer: this.getExplorerUrl(network, address) });
            console.log(`  ✓ ${platform} -> ${network}: ${address}`);
          }
        }
      }
      console.log(`Found ${contracts.length} contract(s) for ${coinId}`);
      return contracts;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`[CoinGecko] Rate limited on ${coinId} - skipping to next source`);
        return []; // Don't retry, let next source handle it
      }
      throw error;
    }
  }

  async getTokenPlatforms(coinId, symbol = '') {
    // Check cache first
    if (symbol) {
      const cached = contractCache.get(symbol);
      if (cached) return cached;
    }
    const contracts = await this.getTokenPlatformsOnce(coinId);
    if (symbol && contracts.length > 0) contractCache.set(symbol, contracts);
    return contracts;
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
    // This is now handled by searchAllSources - kept for compatibility
    return this.searchAllSources(symbol);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Kept for backward compatibility but no longer used internally
  async retryWithBackoff(fn, operationName, maxAttempts = 2) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`⚠️ Rate limit on ${operationName} - skipping`);
        throw error;
      }
      throw error;
    }
  }
}

module.exports = new CoingeckoSearchService();