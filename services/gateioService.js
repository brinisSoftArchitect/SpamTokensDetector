// services/gateioService.js - Gate.io API service
const axios = require('axios');
const coingeckoSearchService = require('./coingeckoSearchService');
const browserManager = require('./browserManager');

class GateioService {
  constructor() {
    this.baseUrl = 'https://www.gate.io';
  }

  async scrapeGateioInfoPage(symbol) {
    let page = null;
    try {
      console.log(`🌐 [GateIO] Scraping info page for ${symbol}...`);
      const url = `https://www.gate.io/en/coin-info/${symbol.toUpperCase()}`;
      page = await browserManager.getPage();
      console.log(`🔗 [GateIO] Loading info page: ${url}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);
      const html = await page.content();
      console.log(`✓ [GateIO] Info page downloaded (${html.length} bytes)`);
      await page.close();
      const contracts = this.extractContracts(html, symbol);
      if (contracts.length > 0) {
        console.log(`✅ [GateIO] Extracted ${contracts.length} contract(s) from info page`);
        contracts.forEach(c => console.log(`   ${c.network}: ${c.address}`));
      } else {
        console.log(`⚠️ [GateIO] No contracts found on info page`);
      }
      return contracts;
    } catch (error) {
      console.log(`⚠️ [GateIO] Info page scraping failed for ${symbol}: ${error.message}`);
      if (page && !page.isClosed()) { try { await page.close(); } catch(e) {} }
      return [];
    }
  }

  async scrapeGateioPage(symbol) {
    let page = null;
    
    try {
      console.log(`🌐 [GateIO] Scraping trade page for ${symbol}...`);
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
      
      // Filter out leveraged/derivative tokens that never have contracts
      const leveragedPattern = /^.+(3L|3S|5L|5S|2L|2S|4L|4S|UP|DOWN|BULL|BEAR|HEDGE|HALF)$/i;
      const stablecoins = new Set(['USDT','USDC','BUSD','DAI','TUSD','USDP','USDD','FDUSD','PYUSD','SUSD','FRAX']);

      pairs.forEach(pair => {
        if (pair.base && pair.trade_status === 'tradable') {
          const symbol = pair.base.toUpperCase();
          // Skip leveraged tokens and stablecoins
          if (leveragedPattern.test(symbol)) return;
          if (stablecoins.has(symbol)) return;
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
      
      // Sort by volume (highest first) — tokens with real volume are more likely to have contracts
      const sortedSymbols = Array.from(symbolData.values())
        .sort((a, b) => b.volume - a.volume)
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
        headers: { 'Accept': 'application/json' }
      });

      const pairs = response.data || [];
      const tokenPair = pairs.find(pair => 
        pair.base?.toLowerCase() === symbol.toLowerCase()
      );

      if (tokenPair) {
        console.log(`Found ${symbol} on Gate.io`);
      }

      // 1. Try CoinGecko first
      const contracts = await this.fetchContractsFromAllSources(symbol);
      if (contracts.length > 0) return contracts;

      if (tokenPair) {
        // 2. Try Gate.io coin-info page (has Blockchain Explorer button with contract)
        console.log(`CoinGecko found nothing, trying Gate.io info page...`);
        const infoContracts = await this.scrapeGateioInfoPage(symbol);
        if (infoContracts.length > 0) {
          console.log(`✅ Found ${infoContracts.length} contract(s) from Gate.io info page`);
          return infoContracts;
        }

        // 3. Fallback: Gate.io trade page
        console.log(`Info page found nothing, trying Gate.io trade page scrape...`);
        const webPageContracts = await this.scrapeGateioPage(symbol);
        if (webPageContracts.length > 0) {
          console.log(`✅ Found ${webPageContracts.length} contract(s) from Gate.io trade page`);
          return webPageContracts;
        }
      }

      return [];
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
      { network: 'fantom', regex: /ftmscan\.com\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://ftmscan.com/token/' },
      { network: 'cronos', regex: /cronoscan\.com\/token\/(0x[a-fA-F0-9]{40})/gi, explorer: 'https://cronoscan.com/token/' },
      { network: 'solana', regex: /solscan\.io\/token\/([A-HJ-NP-Za-km-z1-9]{32,44})/gi, explorer: 'https://solscan.io/token/' },
      { network: 'solana', regex: /explorer\.solana\.com\/address\/([A-HJ-NP-Za-km-z1-9]{32,44})/gi, explorer: 'https://solscan.io/token/' },
      { network: 'tron', regex: /tronscan\.org\/#\/token20\/(T[A-Za-z0-9]{33})/gi, explorer: 'https://tronscan.org/#/token20/' },
      { network: 'tron', regex: /tronscan\.org\/#\/token\/(T[A-Za-z0-9]{33})/gi, explorer: 'https://tronscan.org/#/token/' },
      { network: 'brc20', regex: /uniscan\.cc\/brc20\/([A-Za-z0-9]{1,10})/gi, explorer: 'https://uniscan.cc/brc20/' },
      { network: 'brc20', regex: /ordiscan\.com\/brc-20\/([A-Za-z0-9]{1,10})/gi, explorer: 'https://ordiscan.com/brc-20/' },
      { network: 'sui', regex: /suivision\.xyz\/coin\/(0x[a-fA-F0-9]+::[^"\s>]+)/gi, explorer: 'https://suivision.xyz/coin/' },
      { network: 'ton', regex: /tonscan\.org\/address\/([A-Za-z0-9_-]{48})/gi, explorer: 'https://tonscan.org/address/' },
      { network: 'aptos', regex: /explorer\.aptoslabs\.com\/fungible_asset\/(0x[a-fA-F0-9]+)/gi, explorer: 'https://explorer.aptoslabs.com/fungible_asset/' }
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(html)) !== null) {
        const address = match[1];
        const addressLower = address.toLowerCase();
        const key = `${pattern.network}-${addressLower}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          contracts.push({
            network: pattern.network,
            address: address,
            explorer: `${pattern.explorer}${address}`
          });
          console.log(`Found ${pattern.network} contract: ${address}`);
        }
      }
    }

    // Also try to extract from Gate.io API embedded JSON (coin-info page)
    try {
      const jsonMatch = html.match(/"contract_address"\s*:\s*"(0x[a-fA-F0-9]{40})"/);
      const chainMatch = html.match(/"chain"\s*:\s*"([^"]+)"/);
      if (jsonMatch && chainMatch) {
        const address = jsonMatch[1];
        const network = this.mapChainNameToNetwork(chainMatch[1]);
        if (network) {
          const key = `${network}-${address.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            const explorerBase = this.getExplorerBase(network);
            contracts.push({ network, address, explorer: `${explorerBase}${address}` });
            console.log(`[JSON] Found ${network} contract: ${address}`);
          }
        }
      }
    } catch(e) {}

    if (contracts.length === 0) {
      console.log('No contracts extracted from HTML');
    }

    return contracts;
  }

  extractBrc20FromHtml(html, symbol) {
    // Gate.io info pages sometimes show BRC-20 ticker in text
    const brc20Patterns = [
      new RegExp(`uniscan\.cc/brc20/${symbol}`, 'i'),
      new RegExp(`ordiscan\.com/brc-20/${symbol}`, 'i'),
      /brc.?20/i
    ];
    for (const pat of brc20Patterns) {
      if (pat.test(html)) {
        console.log(`[GateIO] Detected BRC-20 token: ${symbol}`);
        return [{ network: 'brc20', address: symbol.toUpperCase(), explorer: `https://uniscan.cc/brc20/${symbol.toUpperCase()}` }];
      }
    }
    return [];
  }

  mapChainNameToNetwork(chainName) {
    const map = {
      'ETH': 'eth', 'Ethereum': 'eth', 'ethereum': 'eth',
      'BSC': 'bsc', 'BNB Smart Chain': 'bsc', 'bsc': 'bsc',
      'Polygon': 'polygon', 'MATIC': 'polygon',
      'Arbitrum': 'arbitrum', 'ARB': 'arbitrum',
      'Avalanche': 'avalanche', 'AVAX': 'avalanche',
      'Base': 'base', 'BASE': 'base',
      'Optimism': 'optimism', 'OP': 'optimism',
      'Fantom': 'fantom', 'FTM': 'fantom',
      'Cronos': 'cronos', 'CRO': 'cronos',
      'Solana': 'solana', 'SOL': 'solana'
    };
    return map[chainName] || null;
  }

  getExplorerBase(network) {
    const explorers = {
      'eth': 'https://etherscan.io/token/',
      'bsc': 'https://bscscan.com/token/',
      'polygon': 'https://polygonscan.com/token/',
      'arbitrum': 'https://arbiscan.io/token/',
      'avalanche': 'https://snowtrace.io/token/',
      'base': 'https://basescan.org/token/',
      'optimism': 'https://optimistic.etherscan.io/token/',
      'fantom': 'https://ftmscan.com/token/',
      'cronos': 'https://cronoscan.com/token/',
      'solana': 'https://solscan.io/token/',
      'monad': 'https://explorer.monad.xyz/token/'
    };
    return explorers[network] || 'https://etherscan.io/token/';
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