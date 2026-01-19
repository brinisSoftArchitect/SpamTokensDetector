// services/gateioService.js - Gate.io API service
const axios = require('axios');
const coingeckoSearchService = require('./coingeckoSearchService');
const browserManager = require('./browserManager');

class GateioService {
  constructor() {
    this.baseUrl = 'https://www.gate.io';
  }

  async scrapeGateioPage(symbol) {
    let page = null;
    
    try {
      console.log(`🌐 [GateIO] Scraping webpage for ${symbol}...`);
      const url = `https://www.gate.io/trade/${symbol.toUpperCase()}_USDT`;
      
      page = await browserManager.getPage();
      
      console.log(`🔗 [GateIO] Loading ${url}...`);
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      console.log(`⏳ [GateIO] Waiting for dynamic content...`);
      await page.waitForTimeout(4000);
      
      const html = await page.content();
      console.log(`✓ [GateIO] Downloaded page (${html.length} bytes)`);
      
      await page.close();
      
      const contracts = this.extractContracts(html, symbol);
      
      if (contracts.length > 0) {
        console.log(`✅ [GateIO] Extracted ${contracts.length} contract(s)`);
        contracts.forEach(c => console.log(`   ${c.network}: ${c.address}`));
      } else {
        console.log(`⚠️ [GateIO] No blockchain explorer links found`);
      }
      
      return contracts;
    } catch (error) {
      console.log(`⚠️ [GateIO] Scraping failed for ${symbol}: ${error.message}`);
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {}
      }
      return [];
    }
  }

  async getAllTokenSymbols() {
    try {
      console.log('Fetching all tokens from Gate.io...');
      const response = await axios.get('https://api.gateio.ws/api/v4/spot/currency_pairs', {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      const pairs = response.data || [];
      
      // Get ticker data for volume/liquidity info
      console.log('Fetching ticker data for sorting...');
      let tickers = {};
      try {
        const tickerResponse = await axios.get('https://api.gateio.ws/api/v4/spot/tickers', {
          timeout: 30000,
          headers: { 'Accept': 'application/json' }
        });
        
        tickerResponse.data.forEach(ticker => {
          if (ticker.currency_pair) {
            tickers[ticker.currency_pair] = {
              volume: parseFloat(ticker.quote_volume || 0),
              lastPrice: parseFloat(ticker.last || 0)
            };
          }
        });
      } catch (err) {
        console.log('Failed to fetch tickers, will sort by symbol only');
      }
      
      // Create map of symbols with their volume data
      const symbolData = new Map();
      
      pairs.forEach(pair => {
        if (pair.base && pair.trade_status === 'tradable') {
          const symbol = pair.base.toUpperCase();
          const pairKey = `${pair.base}_${pair.quote}`.toUpperCase();
          const tickerData = tickers[pairKey] || { volume: 0, lastPrice: 0 };
          
          // Use the lowest volume if symbol appears multiple times
          if (!symbolData.has(symbol) || tickerData.volume < symbolData.get(symbol).volume) {
            symbolData.set(symbol, {
              symbol: symbol,
              volume: tickerData.volume,
              marketCap: tickerData.volume * tickerData.lastPrice
            });
          }
        }
      });
      
      // Sort by volume (lowest first)
      const sortedSymbols = Array.from(symbolData.values())
        .sort((a, b) => a.volume - b.volume)
        .map(item => item.symbol);
      
      console.log(`Found ${sortedSymbols.length} unique tradable tokens on Gate.io`);
      console.log(`Sorted by volume (lowest first)`);
      console.log(`Lowest volume tokens: ${sortedSymbols.slice(0, 10).join(', ')}`);
      
      return sortedSymbols;
    } catch (error) {
      console.error('Failed to fetch Gate.io tokens:', error.message);
      return [];
    }
  }

  async searchToken(symbol) {
    try {
      console.log(`Searching for ${symbol} using Gate.io API...`);
      const response = await axios.get('https://api.gateio.ws/api/v4/spot/currency_pairs', {
        timeout: 15000,
        headers: {
          'Accept': 'application/json'
        }
      });

      const pairs = response.data || [];
      const tokenPair = pairs.find(pair => 
        pair.base?.toLowerCase() === symbol.toLowerCase()
      );

      if (tokenPair) {
        console.log(`Found ${symbol} on Gate.io`);
      }

      // First try CoinGecko (faster and more reliable)
      const contracts = await this.fetchContractsFromAllSources(symbol);
      
      // Only scrape Gate.io webpage if CoinGecko found nothing
      if (contracts.length === 0 && tokenPair) {
        console.log(`CoinGecko found nothing, trying Gate.io webpage scrape...`);
        const webPageContracts = await this.scrapeGateioPage(symbol);
        if (webPageContracts.length > 0) {
          console.log(`✅ Found ${webPageContracts.length} contract(s) from Gate.io webpage`);
          return webPageContracts;
        }
      }

      return contracts;
    } catch (error) {
      console.log(`Gate.io API failed for ${symbol}, using fallback sources:`, error.message);
      return await this.fetchContractsFromAllSources(symbol);
    }
  }

  async fetchContractsFromAllSources(symbol) {
    try {
      const contracts = await coingeckoSearchService.searchBySymbol(symbol);
      console.log(`Found ${contracts.length} contract(s) for ${symbol} from CoinGecko`);
      
      if (contracts.length === 0) {
        console.log(`No contracts found for ${symbol} - token may not exist or not listed`);
      }
      
      return contracts;
    } catch (error) {
      console.error(`All sources failed for ${symbol}:`, error.message);
      return [];
    }
  }

  extractContracts(html, symbol) {
    const contracts = [];
    const seen = new Set();
    
    const patterns = [
      { network: 'bsc', regex: /bscscan\.com\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://bscscan.com/token/' },
      { network: 'eth', regex: /etherscan\.io\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://etherscan.io/token/' },
      { network: 'polygon', regex: /polygonscan\.com\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://polygonscan.com/token/' },
      { network: 'arbitrum', regex: /arbiscan\.io\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://arbiscan.io/token/' },
      { network: 'avalanche', regex: /snowtrace\.io\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://snowtrace.io/token/' },
      { network: 'monad', regex: /explorer\.monad\.xyz\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://explorer.monad.xyz/token/' },
      { network: 'base', regex: /basescan\.org\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://basescan.org/token/' },
      { network: 'optimism', regex: /optimistic\.etherscan\.io\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://optimistic.etherscan.io/token/' },
      { network: 'fantom', regex: /ftmscan\.com\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://ftmscan.com/token/' }
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(html)) !== null) {
        const address = match[1].toLowerCase();
        const key = `${pattern.network}-${address}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          contracts.push({
            network: pattern.network,
            address: match[1],
            explorer: `${pattern.explorer}${match[1]}`
          });
          console.log(`Found ${pattern.network} contract: ${match[1]}`);
        }
      }
    }

    if (contracts.length === 0) {
      console.log('No contracts extracted from HTML');
    }

    return contracts;
  }

  async getTokenBySymbol(symbol) {
    const normalizedSymbol = symbol.toUpperCase();
    const contracts = await this.searchToken(normalizedSymbol);
    
    if (contracts.length === 0) {
      const altSymbol = normalizedSymbol.replace(/USDT|USD|BTC|ETH$/i, '');
      if (altSymbol !== normalizedSymbol) {
        return await this.searchToken(altSymbol);
      }
    }
    
    return contracts;
  }
}

module.exports = new GateioService();