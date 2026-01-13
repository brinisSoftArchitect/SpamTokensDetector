// services/blockchainService.js - Blockchain explorer service
const axios = require('axios');
const puppeteerScraper = require('./puppeteerScraper');

class BlockchainService {
  constructor() {
    this.scannerApis = {
      bsc: {
        url: 'https://api.bscscan.com/api',
        key: process.env.BSCSCAN_API_KEY || ''
      },
      eth: {
        url: 'https://api.etherscan.io/api',
        key: process.env.ETHERSCAN_API_KEY || ''
      },
      polygon: {
        url: 'https://api.polygonscan.com/api',
        key: process.env.POLYGONSCAN_API_KEY || ''
      },
      arbitrum: {
        url: 'https://api.arbiscan.io/api',
        key: process.env.ARBISCAN_API_KEY || ''
      },
      avalanche: {
        url: 'https://api.snowtrace.io/api',
        key: process.env.SNOWTRACE_API_KEY || ''
      },
      monad: {
        url: 'https://monadapi.monad.xyz/api',
        key: ''
      },
      base: {
        url: 'https://api.basescan.org/api',
        key: process.env.BASESCAN_API_KEY || ''
      },
      optimism: {
        url: 'https://api-optimistic.etherscan.io/api',
        key: process.env.OPTIMISM_API_KEY || ''
      },
      fantom: {
        url: 'https://api.ftmscan.com/api',
        key: process.env.FTMSCAN_API_KEY || ''
      }
    };
    this.Web3 = null;
    this.providers = {};
  }

  async initWeb3() {
    if (!this.Web3) {
      try {
        const Web3Module = require('web3');
        this.Web3 = Web3Module.default || Web3Module;
        console.log('✓ Web3 initialized');
      } catch (error) {
        console.log('⚠ Web3 not installed, using fallback methods');
      }
    }
  }

  getProvider(network) {
    if (!this.providers[network]) {
   const rpcUrls = {
  'eth': 'https://ethereum-rpc.publicnode.com',
  'bsc': 'https://bsc-rpc.publicnode.com',
  'polygon': 'https://polygon-bor-rpc.publicnode.com',
  'arbitrum': 'https://arbitrum-one-rpc.publicnode.com',
  'avalanche': 'https://avalanche-c-chain-rpc.publicnode.com',
  'base': 'https://base-rpc.publicnode.com',
  'optimism': 'https://optimism-rpc.publicnode.com',
  'fantom': 'https://fantom-rpc.publicnode.com'
};
      
      const rpc = rpcUrls[network.toLowerCase()];
      if (rpc && this.Web3) {
        this.providers[network] = new this.Web3(rpc);
        console.log(`✓ Created Web3 provider for ${network}`);
      }
    }
    return this.providers[network];
  }

  async getTokenHoldersViaWeb3(contractAddress, network) {
    try {
      await this.initWeb3();
      
      if (!this.Web3) {
        console.log('Web3 not available, skipping');
        return null;
      }
      
      const web3 = this.getProvider(network);
      
      if (!web3) {
        console.log(`No Web3 provider available for ${network}`);
        return null;
      }

      const ERC20_ABI = [
        {"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"type":"function"},
        {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"},
        {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"}
      ];

      const contract = new web3.eth.Contract(ERC20_ABI, contractAddress);
      
      console.log(`Calling totalSupply() on contract ${contractAddress}...`);
      const totalSupply = await contract.methods.totalSupply().call();
      
      console.log(`Calling decimals() on contract ${contractAddress}...`);
      const decimals = await contract.methods.decimals().call();

      console.log(`✓ Web3 contract call successful for ${contractAddress}`);
      console.log(`Total Supply (raw): ${totalSupply}`);
      console.log(`Decimals: ${decimals}`);

      return {
        totalSupply: totalSupply.toString(),
        decimals: decimals.toString(),
        accessible: true
      };
    } catch (error) {
      console.log(`Web3 holder fetch failed for ${network}:`, error.message);
      console.log(`Error stack:`, error.stack);
      return null;
    }
  }

  async getTokenDetails(contractAddress, network) {
    try {
      const networkLower = network.toLowerCase();
      const scanner = this.scannerApis[networkLower];
      
      if (!scanner) {
        console.warn(`No scanner configured for network: ${network}`);
        return this.generateRealisticMockData(contractAddress);
      }

      const web3Data = await this.getTokenHoldersViaWeb3(contractAddress, network);
      const data = await this.parseFromWeb(contractAddress, network);
      
      // Try to get totalSupply from Web3 if not available from scraping
      if ((!data.totalSupply || data.totalSupply === '0') && web3Data && web3Data.accessible) {
        data.totalSupply = web3Data.totalSupply;
        data.decimals = web3Data.decimals;
        data.web3Verified = true;
        console.log(`✓ Using Web3 totalSupply: ${data.totalSupply}`);
      } else if (web3Data && web3Data.accessible) {
        data.decimals = web3Data.decimals;
        data.web3Verified = true;
      }
      
      // Always try to get totalSupply if missing
      if (!data.totalSupply || data.totalSupply === '0' || data.totalSupply === 'null') {
        console.log('⚠️ No totalSupply from scraping, trying multiple sources...');
        
        // Try CoinGecko first (most reliable)
        const coingeckoData = await this.getTotalSupplyFromCoinGecko(contractAddress, network);
        if (coingeckoData && coingeckoData.totalSupply) {
          data.totalSupply = coingeckoData.totalSupply;
          data.decimals = coingeckoData.decimals || data.decimals || '18';
          console.log(`✓ CoinGecko: totalSupply=${data.totalSupply}, decimals=${data.decimals}`);
        } else {
          // Try Web3 as fallback
          console.log('Trying Web3 fallback...');
          const web3Fallback = await this.getTokenHoldersViaWeb3(contractAddress, network);
          if (web3Fallback && web3Fallback.totalSupply) {
            data.totalSupply = web3Fallback.totalSupply;
            data.decimals = web3Fallback.decimals;
            data.web3Verified = true;
            console.log(`✓ Web3: totalSupply=${data.totalSupply}, decimals=${data.decimals}`);
          } else {
            console.log('❌ All fallback methods failed for totalSupply');
          }
        }
      }
      
      // Calculate percentages for holders if we have totalSupply and decimals
      if (data.totalSupply && data.holders && data.holders.length > 0) {
        const decimals = parseInt(data.decimals) || 18;
        
        // Parse totalSupply correctly - it might be a large number or scientific notation
        let totalSupplyBigInt;
        let adjustedTotalSupply;
        
        try {
          // Convert to string first to handle scientific notation
          const totalSupplyStr = data.totalSupply.toString();
          
          // If it contains 'e' (scientific notation), parse it properly
          if (totalSupplyStr.includes('e')) {
            totalSupplyBigInt = BigInt(Math.floor(parseFloat(totalSupplyStr)));
          } else {
            totalSupplyBigInt = BigInt(totalSupplyStr.split('.')[0]);
          }
          
          // Convert to decimal number by dividing by 10^decimals
          adjustedTotalSupply = Number(totalSupplyBigInt) / Math.pow(10, decimals);
        } catch (error) {
          console.log(`Error parsing totalSupply: ${error.message}`);
          adjustedTotalSupply = parseFloat(data.totalSupply);
        }
        
        console.log(`\n=== PERCENTAGE CALCULATION ===`);
        console.log(`Raw Total Supply: ${data.totalSupply}`);
        console.log(`Decimals: ${decimals}`);
        console.log(`Adjusted Total Supply: ${adjustedTotalSupply.toLocaleString()}`);
        
        data.holders = data.holders.map(holder => {
          const rawBalance = parseFloat(holder.balance) || 0;
          const percentage = adjustedTotalSupply > 0 ? (rawBalance / adjustedTotalSupply) * 100 : 0;
          
          if (holder.rank <= 3) {
            console.log(`\nHolder ${holder.rank}:`);
            console.log(`  Balance: ${rawBalance.toLocaleString()}`);
            console.log(`  Percentage: ${percentage.toFixed(4)}%`);
          }
          
          return {
            ...holder,
            percentage: parseFloat(percentage.toFixed(4))
          };
        });
        
        // Store the adjusted total supply for later use
        data.adjustedTotalSupply = adjustedTotalSupply;
        
        console.log(`✓ Calculated percentages for ${data.holders.length} holders\n`);
      } else {
        console.log('⚠️ Cannot calculate percentages - missing totalSupply or holders data');
      }
      
      return data;
    } catch (error) {
      console.error(`Blockchain service error for ${network}:`, error.message);
      return this.generateRealisticMockData(contractAddress);
    }
  }

  async parseFromWeb(contractAddress, network) {
    try {
      const baseUrl = this.getScanUrl(network, contractAddress);
      const holdersUrl = `${baseUrl}#balances`;
      console.log(`Fetching token info from: ${baseUrl}`);
      
      let holders = [];
      const iframeUrl = this.getHoldersIframeUrl(network, contractAddress);
      
      console.log(`Fetching holders from iframe: ${iframeUrl}`);
      try {
        const holdersResponse = await axios.get(iframeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': baseUrl
          },
          timeout: 15000
        });
        
        console.log(`✓ Iframe response received (${holdersResponse.data.length} bytes)`);
        holders = this.extractTopHolders(holdersResponse.data, contractAddress);
        console.log(`✓ Extraction complete: ${holders.length} holders found`);
      } catch (iframeError) {
        console.error(`✗ Iframe fetch failed:`, iframeError.message);
        holders = [];
      }
      
      const response = await axios.get(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
      
      const html = response.data;
      const name = this.extractTokenName(html);
      const symbol = this.extractTokenSymbol(html);
      const totalSupply = this.extractTotalSupply(html);

      console.log(`\n=== FINAL RESULTS ===`);
      console.log(`Token: ${name} (${symbol})`);
      console.log(`Holders extracted: ${holders.length}`);
      if (holders.length > 0) {
        console.log(`Top holder: ${holders[0].address} (${holders[0].percentage}%)`);
        console.log('First 3 holders:', JSON.stringify(holders.slice(0, 3), null, 2));
      } else {
        console.log('WARNING: No holders extracted, will use mock data');
      }
      console.log(`===================\n`);
      
      return {
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        totalSupply: totalSupply,
        holders: holders,
        holdersSourceUrl: holdersUrl,
        creatorAddress: null,
        liquidity: null
      };
    } catch (error) {
      console.log(`Web parsing failed for ${network}:`, error.message);
      console.error('Stack trace:', error.stack);
      return this.generateRealisticMockData(contractAddress);
    }
  }

  getScanUrl(network, address) {
    const urls = {
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
    return urls[network.toLowerCase()] || urls['eth'];
  }

  getHoldersIframeUrl(network, address) {
    const iframeUrls = {
      'bsc': `https://bscscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'eth': `https://etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'polygon': `https://polygonscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'arbitrum': `https://arbiscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'avalanche': `https://snowtrace.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'monad': `https://monadapi.monad.xyz/api/v1/token/${address}/holders`,
      'base': `https://basescan.org/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'optimism': `https://optimistic.etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'fantom': `https://ftmscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`
    };
    return iframeUrls[network.toLowerCase()] || iframeUrls['eth'];
  }

  extractTokenName(html) {
    const patterns = [
      /<span[^>]*title="([^"]+)"[^>]*>.*?Token.*?<\/span>/i,
      /<div[^>]*class="[^"]*token[^"]*"[^>]*>([^<]+)<\/div>/i,
      /<h1[^>]*>([^<]+)<\/h1>/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  extractTokenSymbol(html) {
    const match = html.match(/\(([A-Z]{2,10})\)/);
    return match ? match[1] : null;
  }

  extractTotalSupply(html) {
    // Try multiple patterns to extract total supply
    const patterns = [
      /Total Supply[^>]*>([\d,\.]+)/i,
      /Max Total Supply[^>]*>([\d,\.]+)/i,
      /totalSupply["']?\s*:\s*["']?([\d,\.]+)/i,
      /<div[^>]*>\s*([\d,\.]+)\s*<\/div>\s*<div[^>]*>Total Supply/i,
      /title=["']Total Supply["'][^>]*>([\d,\.]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const value = match[1].replace(/,/g, '');
        console.log(`✓ Found Total Supply in HTML: ${value}`);
        return value;
      }
    }
    
    console.log('⚠️ Total Supply not found in HTML');
    return null;
  }

  extractTopHolders(html, contractAddress) {
    const holders = [];
    const contractAddressLower = contractAddress.toLowerCase();
    
    console.log(`\n=== BLOCKCHAIN HOLDER EXTRACTION PROCESS ===`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`HTML Size: ${html.length} bytes`);
    console.log(`Step 1: Locating <tbody> in HTML...`);
    
    const tbodyPattern = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i;
    const tbodyMatch = html.match(tbodyPattern);
    
    if (!tbodyMatch) {
      console.log('❌ tbody not found in HTML');
      const fs = require('fs');
      fs.writeFileSync('debug_holders_page.html', html);
      console.log('💾 Saved HTML to debug_holders_page.html for debugging');
      console.log('⚠️ Using mock data as fallback');
      return this.generateMockHolders();
    }
    
    console.log('✓ tbody found, proceeding to extract rows...');
    
    const tbody = tbodyMatch[1];
    console.log(`\nStep 2: Parsing table rows...`);
    const rowPattern = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    let rowCount = 0;
    
    console.log('\n--- Processing Each Holder Row ---');
    while ((rowMatch = rowPattern.exec(tbody)) !== null && holders.length < 15) {
      rowCount++;
      const row = rowMatch[1];
      
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells = [];
      let tdMatch;
      
      while ((tdMatch = tdPattern.exec(row)) !== null) {
        cells.push(tdMatch[1]);
      }
      
      if (rowCount === 1) {
        console.log(`First row cells count: ${cells.length}`);
        cells.forEach((cell, idx) => {
          console.log(`Cell ${idx}: ${cell.substring(0, 100).replace(/\n/g, ' ')}`);
        });
      }
      
      if (cells.length < 4) {
        console.log(`Row ${rowCount}: Not enough cells (${cells.length})`);
        continue;
      }
      
      const rank = parseInt(cells[0].trim());
      if (isNaN(rank)) {
        console.log(`Row ${rowCount}: Invalid rank`);
        continue;
      }
      
      const addressMatch = cells[1].match(/data-highlight-target="(0x[a-fA-F0-9]{40})"/);
      if (!addressMatch) {
        console.log(`Row ${rowCount}: No address match`);
        continue;
      }
      const address = addressMatch[1];
      
      const labelMatch = cells[1].match(/>([^<]+)</)?.[1]?.trim() || null;
      const hasExchangeLabel = labelMatch && this.isExchangeLabel(labelMatch);
      const isBlackhole = this.isBlackholeAddress(address);
      
      const balanceText = cells[2].replace(/<[^>]*>/g, '').trim().replace(/,/g, '');
      const balance = balanceText || '0';
      
      // Don't extract percentage from HTML, we'll calculate it later from balance/totalSupply
      
      if (rowCount === 1) {
        console.log(`\nDEBUG Balance extraction:`);
        console.log(`  Raw Cell 2: ${cells[2].substring(0, 200)}`);
        console.log(`  Extracted Balance: ${balance}`);
      }
      
      const balanceNum = parseFloat(balance);
      if (balanceNum <= 0 || isNaN(balanceNum)) {
        console.log(`Row ${rowCount}: Invalid balance (${balance})`);
        continue;
      }
      
      const isContractAddress = address.toLowerCase() === contractAddressLower;
      
      const holderData = { 
        address, 
        balance, 
        percentage: 0,
        rank,
        label: labelMatch,
        isExchange: hasExchangeLabel,
        isBlackhole: isBlackhole,
        isContract: isContractAddress,
        type: isContractAddress ? 'Contract' : isBlackhole ? 'Blackhole' : hasExchangeLabel ? 'Exchange' : 'Regular'
      };
      
      if (balanceNum > 0) {
        holders.push(holderData);
        
        if (rowCount <= 3) {
          console.log(`\n✓ HOLDER ${rank}:`);
          console.log(`   Address: ${address}`);
          console.log(`   Balance: ${balance}`);
          console.log(`   Label: ${labelMatch || 'None'}`);
          console.log(`   Type: ${holderData.type}`);
        }
      }
    }
    
    console.log(`\n--- Extraction Summary ---`);
    console.log(`Total Rows Processed: ${rowCount}`);
    console.log(`Valid Holders Extracted: ${holders.length}`);
    
    if (holders.length > 0) {
      console.log('\n=== TOP HOLDERS SUMMARY ===');
      console.log(`Top Holder: ${holders[0].address}`);
      console.log(`Top Holder %: ${holders[0].percentage}%`);
      const top10Total = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
      console.log(`Top ${Math.min(10, holders.length)} Combined: ${top10Total.toFixed(2)}%`);
      console.log('=== EXTRACTION COMPLETE ===\n');
      return holders;
    } else {
      console.log('⚠️ No valid holders found, using mock data');
      console.log('=== EXTRACTION COMPLETE (MOCK DATA) ===\n');
      return this.generateMockHolders();
    }
  }

  extractHoldersAlternative(html, contractAddress) {
    const holders = [];
    const contractAddressLower = contractAddress.toLowerCase();
    
    const addressPercentagePattern = /data-highlight-target=['"]([^'"]+)['"].*?([\d.]+)\s*%/gi;
    const matches = [];
    let match;
    
    while ((match = addressPercentagePattern.exec(html)) !== null) {
      matches.push({
        address: match[1].trim(),
        percentage: parseFloat(match[2])
      });
    }
    
    for (let i = 0; i < Math.min(10, matches.length); i++) {
      const item = matches[i];
      if (item.address.toLowerCase() !== contractAddressLower && item.percentage > 0 && item.percentage <= 100) {
        holders.push({
          address: item.address,
          balance: '0',
          percentage: item.percentage,
          rank: holders.length + 1
        });
        console.log(`    ✓ Rank ${holders.length}: ${item.address} - ${item.percentage}%`);
      }
    }
    
    return holders.length > 0 ? holders : this.generateMockHolders();
  }

  extractHoldersFallback(html, contractAddress) {
    const holders = [];
    const contractAddressLower = contractAddress.toLowerCase();
    
    const addressPattern = /0x[a-fA-F0-9]{40}/g;
    const percentPattern = /([\d,]+\.\d+)\s*%/g;
    
    const addresses = [];
    const percentages = [];
    
    let match;
    while ((match = addressPattern.exec(html)) !== null) {
      const addr = match[0].toLowerCase();
      if (addr !== contractAddressLower) {
        addresses.push(match[0]);
      }
    }
    
    while ((match = percentPattern.exec(html)) !== null) {
      const pct = parseFloat(match[1].replace(/,/g, ''));
      if (pct > 0 && pct <= 100) {
        percentages.push(pct);
      }
    }
    
    const minLength = Math.min(10, addresses.length, percentages.length);
    for (let i = 0; i < minLength; i++) {
      holders.push({
        address: addresses[i],
        balance: '0',
        percentage: percentages[i],
        rank: i + 1
      });
    }
    
    return holders.length > 0 ? holders : this.generateMockHolders();
  }

  isExchangeLabel(label) {
    if (!label) return false;
    const exchangeKeywords = [
      'binance', 'coinbase', 'kraken', 'okx', 'huobi', 'kucoin', 'gate',
      'bybit', 'bitfinex', 'bitstamp', 'gemini', 'crypto.com', 'mexc',
      'bitget', 'bitmart', 'bithumb', 'upbit', 'coinone', 'korbit',
      'uniswap', 'pancakeswap', 'sushiswap', 'curve', 'balancer',
      'indodax', 'tokocrypto', 'exchange', 'dex', 'cex', 'dep:'
    ];
    const lowerLabel = label.toLowerCase();
    return exchangeKeywords.some(keyword => lowerLabel.includes(keyword));
  }

  isBlackholeAddress(address) {
    if (!address) return false;
    const blackholeAddresses = [
      '0x0000000000000000000000000000000000000000',
      '0x000000000000000000000000000000000000dead',
      '0x0000000000000000000000000000000000000001',
      '0xdead000000000000000042069420694206942069',
      '0x0000000000000000000000000000000000000002'
    ];
    const lowerAddress = address.toLowerCase();
    return blackholeAddresses.some(blackhole => lowerAddress === blackhole.toLowerCase()) ||
           lowerAddress.endsWith('dead') ||
           lowerAddress === '0x' + '0'.repeat(40);
  }

  generateMockHolders() {
    console.log('⚠️ GENERATING MOCK HOLDER DATA');
    console.log('Note: This is fallback data and NOT REAL holder information');
    const percentages = [45, 15, 10, 8, 6, 4, 3, 3, 3, 3];
    return percentages.map((pct, idx) => ({
      address: '0x' + Math.random().toString(16).substr(2, 40),
      balance: '0',
      percentage: pct,
      rank: idx + 1,
      label: 'MOCK_DATA',
      isExchange: false
    }));
  }

  generateRealisticMockData(contractAddress) {
    const random = parseInt(contractAddress.slice(2, 10), 16) % 100;
    
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      totalSupply: null,
      holders: this.generateMockHolders(),
      creatorAddress: null,
      liquidity: null
    };
  }

  async getTokenInfo(contractAddress, scanner) {
    const response = await axios.get(scanner.url, {
      params: {
        module: 'token',
        action: 'tokeninfo',
        contractaddress: contractAddress,
        apikey: scanner.key
      },
      timeout: 10000
    });

    const result = response.data?.result?.[0];
    return {
      name: result?.tokenName,
      symbol: result?.symbol,
      totalSupply: result?.totalSupply
    };
  }

  async getTopHolders(contractAddress, scanner) {
    const response = await axios.get(scanner.url, {
      params: {
        module: 'token',
        action: 'tokenholderlist',
        contractaddress: contractAddress,
        page: 1,
        offset: 20,
        apikey: scanner.key
      },
      timeout: 10000
    });

    const holders = response.data?.result || [];
    return holders.map((holder, index) => ({
      address: holder.TokenHolderAddress,
      balance: holder.TokenHolderQuantity,
      percentage: parseFloat(holder.TokenHolderPercentage || 0),
      rank: index + 1
    }));
  }

  async getTokenCreator(contractAddress, scanner) {
    const response = await axios.get(scanner.url, {
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: contractAddress,
        apikey: scanner.key
      },
      timeout: 10000
    });

    return response.data?.result?.[0]?.contractCreator || null;
  }

  async getTotalSupplyFromCoinGecko(contractAddress, network) {
    try {
      const coingeckoService = require('./coingeckoService');
      console.log(`Fetching totalSupply from CoinGecko for ${contractAddress}...`);
      
      const tokenInfo = await coingeckoService.getTokenInfo(contractAddress, network);
      
      if (tokenInfo && tokenInfo.totalSupply) {
        console.log(`✓ CoinGecko returned totalSupply: ${tokenInfo.totalSupply}`);
        return {
          totalSupply: tokenInfo.totalSupply,
          decimals: tokenInfo.decimals || '18'
        };
      }
      
      console.log('CoinGecko did not return totalSupply');
      return null;
    } catch (error) {
      console.log(`CoinGecko totalSupply fetch failed: ${error.message}`);
      return null;
    }
  }

  getMockData(contractAddress) {
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      totalSupply: null,
      holders: [
        { address: '0x1234...', balance: '50000000', percentage: 85.5, rank: 1 },
        { address: '0x5678...', balance: '5000000', percentage: 8.5, rank: 2 },
        { address: '0x9abc...', balance: '2000000', percentage: 3.4, rank: 3 }
      ],
      creatorAddress: null,
      liquidity: null
    };
  }
}

module.exports = new BlockchainService();