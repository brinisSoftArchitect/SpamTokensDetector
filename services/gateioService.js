// services/gateioService.js - Gate.io API service
const axios = require('axios');
const coingeckoSearchService = require('./coingeckoSearchService');

class GateioService {
  constructor() {
    this.baseUrl = 'https://www.gate.io';
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

      return await this.fetchContractsFromAllSources(symbol);
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