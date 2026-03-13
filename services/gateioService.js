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
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
      await page.waitForTimeout(5000);
      const html = await page.content();
      console.log(`✓ [GateIO] Info page downloaded (${html.length} bytes)`);

      // ── Click "Blockchain Explorer" button/dropdown to expand all links ──
      try {
        // Find and click any element that looks like a blockchain explorer toggle
        await page.evaluate(() => {
          document.querySelectorAll('button, div[class*="dropdown"], span').forEach(el => {
            const text = el.textContent?.trim().toLowerCase() || '';
            if (text.includes('blockchain explorer') || text.includes('explorer')) {
              el.click();
            }
          });
        });
        await page.waitForTimeout(1500); // wait for dropdown to open
      } catch(e) { /* ignore click errors */ }

      // ── Extract blockchain explorer links from buttons/anchors ───────
      const explorerLinks = await page.evaluate(() => {
        const links = [];
        const explorerKeywords = [
          'etherscan', 'bscscan', 'polygonscan', 'arbiscan', 'snowtrace',
          'basescan', 'solscan', 'tronscan', 'ftmscan', 'cronoscan',
          'mainnet.decred', 'blockchair', 'apescan', 'explorer.',
          'blockchain.com', 'xrpscan', 'cardanoscan', 'subscan',
          'stellarchain', 'algoexplorer', 'mintscan', 'tonscan',
          'suivision', 'aptoslabs'
        ];

        // Grab all <a> tags anywhere in the page including inside dropdowns/tooltips
        document.querySelectorAll('a[href], [data-href]').forEach(a => {
          const href = (a.href || a.getAttribute('data-href') || '').toLowerCase();
          const text = a.textContent?.trim() || '';
          if (explorerKeywords.some(kw => href.includes(kw))) {
            links.push({ href: a.href || a.getAttribute('data-href'), text });
          }
        });

        // Also scan the raw HTML for any hidden explorer URLs in data attributes or script tags
        const allText = document.documentElement.innerHTML;
        const urlRegex = /https?:\/\/[\w.-]*(?:etherscan|bscscan|polygonscan|arbiscan|snowtrace|basescan|solscan|tronscan|ftmscan|cronoscan|apescan|blockchair|mainnet\.decred|xrpscan|cardanoscan|subscan|stellarchain|algoexplorer|tonscan)\.(?:io|org|com)[^\s"'<>]*/gi;
        let match;
        const seen = new Set(links.map(l => l.href));
        while ((match = urlRegex.exec(allText)) !== null) {
          const url = match[0].replace(/["'>]+$/, '');
          if (!seen.has(url)) {
            seen.add(url);
            links.push({ href: url, text: 'extracted-from-html' });
          }
        }

        return links;
      });

      if (explorerLinks.length > 0) {
        console.log(`🔗 [GateIO] Found ${explorerLinks.length} explorer link(s) on info page:`);
        explorerLinks.forEach(l => console.log(`   ${l.text}: ${l.href}`));
      }

      await page.close();
      const contracts = this.extractContracts(html, symbol);

      // Also parse explorer links for native-chain URLs
      for (const link of explorerLinks) {
        const nativeNet = this.detectNativeNetworkFromUrl(link.href);
        if (nativeNet && !contracts.find(c => c.network === nativeNet)) {
          contracts.push({ network: nativeNet, address: 'native', explorer: link.href, isNative: true });
          console.log(`✅ [GateIO] Detected native network from explorer link: ${nativeNet} → ${link.href}`);
        }
      }

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

  detectNativeNetworkFromUrl(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('mainnet.decred') || lower.includes('dcrdata')) return 'dcr';
    if (lower.includes('mempool.space') || lower.includes('blockchain.com/btc')) return 'btc';
    if (lower.includes('cardanoscan')) return 'ada';
    if (lower.includes('solscan') || lower.includes('explorer.solana')) return 'sol';
    if (lower.includes('tronscan')) return 'trx';
    if (lower.includes('polkadot.subscan') || lower.includes('polkadot.network')) return 'dot';
    if (lower.includes('xrpscan') || lower.includes('xrpl.org')) return 'xrp';
    if (lower.includes('mintscan.io/cosmos')) return 'atom';
    if (lower.includes('explorer.near')) return 'near';
    if (lower.includes('algoexplorer') || lower.includes('explorer.perawallet')) return 'algo';
    if (lower.includes('blockchair.com/litecoin')) return 'ltc';
    if (lower.includes('blockchair.com/bitcoin-cash')) return 'bch';
    if (lower.includes('stellarchain') || lower.includes('stellar.expert')) return 'xlm';
    if (lower.includes('explorer.chainweb') || lower.includes('kadena')) return 'kda';
    return null;
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

  async fetchContractsFromGateioAPI(symbol) {
    // Use Gate.io REST API to get contract addresses directly — PRIMARY source, no browser needed
    try {
      console.log(`🔌 [GateIO] Fetching contract via API for ${symbol} (PRIORITY SOURCE)...`);
      const response = await axios.get(`https://api.gateio.ws/api/v4/spot/currencies/${symbol.toUpperCase()}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });
      const data = response.data;
      if (!data) return [];

      console.log(`[GateIO API] Currency data:`, JSON.stringify(data).substring(0, 300));

      const contracts = [];
      const seen = new Set();

      // Gate.io API returns chain info in different fields depending on version
      // Try top-level contract field
      // Gate.io API uses different field names: chains[].addr, chains[].name
      const chains = data.chains || data.chain_info || [];
      if (Array.isArray(chains) && chains.length > 0) {
        for (const chain of chains) {
          // Gate.io uses 'addr' field (not 'contract_address')
          const addr = chain.addr || chain.contract_address || chain.address || chain.contract || '';
          const chainName = chain.name || chain.chain || chain.chain_id || '';
          console.log(`[GateIO API] chain entry: name=${chainName} addr=${addr.substring(0,20)}...`);
          if (addr && addr !== '' && addr !== '0x0000000000000000000000000000000000000000') {
            const network = this.mapChainNameToNetwork(chainName) || this.guessNetworkFromChain(chainName);
            if (network) {
              const key = `${network}-${addr.toLowerCase()}`;
              if (!seen.has(key)) {
                seen.add(key);
                contracts.push({ network, address: addr, explorer: `${this.getExplorerBase(network)}${addr}` });
                console.log(`✅ [GateIO API] ${network}: ${addr}`);
              }
            } else {
              console.log(`⚠️ [GateIO API] Unknown chain "${chainName}" for addr ${addr.substring(0,12)}...`);
            }
          }
        }
      }

      // Also check root-level chain/contract_address
      const rootAddr = data.contract_address || data.addr || '';
      const rootChain = data.chain || data.network || '';
      if (rootAddr && rootAddr !== '' && rootAddr !== '0x0000000000000000000000000000000000000000') {
        const network = this.mapChainNameToNetwork(rootChain) || this.guessNetworkFromChain(rootChain);
        if (network) {
          const key = `${network}-${rootAddr.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            contracts.push({ network, address: rootAddr, explorer: `${this.getExplorerBase(network)}${rootAddr}` });
            console.log(`✅ [GateIO API root] ${network}: ${rootAddr}`);
          }
        }
      }

      if (contracts.length > 0) {
        console.log(`✅ [GateIO API] Found ${contracts.length} contract(s) for ${symbol}`);
      } else {
        console.log(`⚠️ [GateIO API] No contracts in API response for ${symbol}`);
      }
      return contracts;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`⚠️ [GateIO API] ${symbol} not found on Gate.io`);
      } else {
        console.log(`⚠️ [GateIO API] Failed for ${symbol}: ${error.message}`);
      }
      return [];
    }
  }

  guessNetworkFromChain(chainName) {
    if (!chainName) return null;
    const lower = chainName.toLowerCase();
    if (lower.includes('eth') || lower.includes('erc')) return 'eth';
    if (lower.includes('bsc') || lower.includes('bnb') || lower.includes('bep')) return 'bsc';
    if (lower.includes('polygon') || lower.includes('matic')) return 'polygon';
    if (lower.includes('arb')) return 'arbitrum';
    if (lower.includes('avax') || lower.includes('avalanche')) return 'avalanche';
    if (lower.includes('base')) return 'base';
    if (lower.includes('op') || lower.includes('optimism')) return 'optimism';
    if (lower.includes('ftm') || lower.includes('fantom')) return 'fantom';
    if (lower.includes('sol')) return 'solana';
    if (lower.includes('tron') || lower.includes('trx') || lower.includes('trc')) return 'tron';
    if (lower.includes('cro') || lower.includes('cronos')) return 'cronos';
    return null;
  }

  async searchToken(symbol) {
    try {
      // ── Step 1: Gate.io REST API (fastest, no browser) — PRIORITY SOURCE ──
      const apiContracts = await this.fetchContractsFromGateioAPI(symbol);
      if (apiContracts.length > 0) {
        console.log(`✅ [GateIO] Got ${apiContracts.length} contract(s) from API for ${symbol} — PRIORITIZED`);
        // Gate.io API contracts are the most reliable — return immediately, put them first
        return apiContracts;
      }

      // ── Step 2: Gate.io info page scrape (browser) ──────────────────────
      console.log(`[GateIO] API found nothing, trying info page scrape for ${symbol}...`);
      const infoContracts = await this.scrapeGateioInfoPage(symbol);
      if (infoContracts.length > 0) {
        console.log(`✅ [GateIO] Found ${infoContracts.length} contract(s) from info page`);
        return infoContracts;
      }

      // ── Step 3: Gate.io trade page scrape (browser) ─────────────────────
      console.log(`[GateIO] Info page found nothing, trying trade page scrape for ${symbol}...`);
      const tradeContracts = await this.scrapeGateioPage(symbol);
      if (tradeContracts.length > 0) {
        console.log(`✅ [GateIO] Found ${tradeContracts.length} contract(s) from trade page`);
        return tradeContracts;
      }

      // ── Step 4: CoinGecko / CoinPaprika fallback (only if Gate.io has nothing) ──
      console.log(`[GateIO] All Gate.io methods failed, falling back to CoinGecko...`);
      const cgContracts = await this.fetchContractsFromAllSources(symbol);
      if (cgContracts.length > 0) return cgContracts;

      return [];
    } catch (error) {
      console.log(`Gate.io searchToken error for ${symbol}: ${error.message}`);
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
    if (!chainName) return null;
    // Normalize: remove spaces, uppercase for lookup
    const map = {
      // Gate.io specific chain names (from API)
      'BASEEVM': 'base', 'BaseEVM': 'base',
      'ETHEVM': 'eth', 'EthEVM': 'eth',
      'BSCEVM': 'bsc', 'BscEVM': 'bsc',
      'POLYGONEVM': 'polygon', 'PolygonEVM': 'polygon',
      'ARBITRUMEVM': 'arbitrum', 'ArbitrumEVM': 'arbitrum',
      'AVALANCHEEVM': 'avalanche', 'AvalancheEVM': 'avalanche',
      'OPTIMISMEVM': 'optimism', 'OptimismEVM': 'optimism',
      'FANTOHEVM': 'fantom', 'FantomEVM': 'fantom',
      'CRONOSEV': 'cronos', 'CronosEVM': 'cronos',
      'SOL': 'solana', 'SOLANA': 'solana',
      'TRX': 'tron', 'TRON': 'tron',
      // Standard names
      'ETH': 'eth', 'Ethereum': 'eth', 'ethereum': 'eth', 'ERC20': 'eth', 'erc20': 'eth',
      'BSC': 'bsc', 'BNB Smart Chain': 'bsc', 'bsc': 'bsc', 'BEP20': 'bsc', 'bep20': 'bsc', 'BNB': 'bsc',
      'Polygon': 'polygon', 'MATIC': 'polygon', 'polygon': 'polygon', 'POLYGON': 'polygon',
      'Arbitrum': 'arbitrum', 'ARB': 'arbitrum', 'arbitrum': 'arbitrum', 'ARBITRUM': 'arbitrum',
      'Avalanche': 'avalanche', 'AVAX': 'avalanche', 'avalanche': 'avalanche', 'AVALANCHE': 'avalanche',
      'Base': 'base', 'BASE': 'base', 'base': 'base',
      'Optimism': 'optimism', 'OP': 'optimism', 'optimism': 'optimism', 'OPTIMISM': 'optimism',
      'Fantom': 'fantom', 'FTM': 'fantom', 'fantom': 'fantom', 'FANTOM': 'fantom',
      'Cronos': 'cronos', 'CRO': 'cronos', 'cronos': 'cronos', 'CRONOS': 'cronos',
      'Solana': 'solana', 'solana': 'solana',
      'Tron': 'tron', 'tron': 'tron', 'TRC20': 'tron', 'trc20': 'tron',
      'TON': 'ton', 'ton': 'ton',
      'SUI': 'sui', 'sui': 'sui',
      'Aptos': 'aptos', 'APT': 'aptos'
    };
    // Try direct map first, then strip 'EVM' suffix and retry
    if (map[chainName]) return map[chainName];
    const stripped = chainName.replace(/EVM$/i, '').replace(/evm$/i, '');
    return map[stripped] || map[stripped.toUpperCase()] || null;
  
 
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