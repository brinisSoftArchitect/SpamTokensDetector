// services/blockchainService.js - Blockchain explorer service
const axios = require('axios');
const puppeteerScraper = require('./puppeteerScraper');
const aiHtmlParser = require('./aiHtmlParser');
const holderConcentrationService = require('./holderConcentrationService');

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
      },
      cronos: {
        url: 'https://api.cronoscan.com/api',
        key: process.env.CRONOSCAN_API_KEY || ''
      },
      moonbeam: {
        url: 'https://api-moonbeam.moonscan.io/api',
        key: process.env.MOONBEAM_API_KEY || ''
      },
      moonriver: {
        url: 'https://api-moonriver.moonscan.io/api',
        key: process.env.MOONRIVER_API_KEY || ''
      },
      gnosis: {
        url: 'https://api.gnosisscan.io/api',
        key: process.env.GNOSIS_API_KEY || ''
      },
      celo: {
        url: 'https://api.celoscan.io/api',
        key: process.env.CELO_API_KEY || ''
      },
      linea: {
        url: 'https://api.lineascan.build/api',
        key: process.env.LINEA_API_KEY || ''
      },
      scroll: {
        url: 'https://api.scrollscan.com/api',
        key: process.env.SCROLL_API_KEY || ''
      },
      zksync: {
        url: 'https://api-era.zksync.network/api',
        key: process.env.ZKSYNC_API_KEY || ''
      },
      mantle: {
        url: 'https://explorer.mantle.xyz/api',
        key: process.env.MANTLE_API_KEY || ''
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
  'fantom': 'https://fantom-rpc.publicnode.com',
  'cronos': 'https://evm-cronos.crypto.org',
  'moonbeam': 'https://rpc.api.moonbeam.network',
  'moonriver': 'https://rpc.api.moonriver.moonbeam.network',
  'gnosis': 'https://rpc.gnosischain.com',
  'celo': 'https://forno.celo.org',
  'linea': 'https://rpc.linea.build',
  'scroll': 'https://rpc.scroll.io',
  'zksync': 'https://mainnet.era.zksync.io',
  'mantle': 'https://rpc.mantle.xyz'
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
        return {
          name: null,
          symbol: null,
          totalSupply: null,
          holders: [],
          creatorAddress: null,
          liquidity: null,
          error: 'Network not supported'
        };
      }

      const data = await this.parseFromWeb(contractAddress, network);
      
      // Check if parsing failed (returns error)
      if (data.error) {
        console.log(`⚠️ parseFromWeb failed: ${data.error}`);
        return data;
      }
      
      const web3Data = await this.getTokenHoldersViaWeb3(contractAddress, network);
      
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
      
      // Verify we have valid holders data before calculating percentages
      if (!data.holders || data.holders.length === 0) {
        console.log('⚠️ No holders data available for percentage calculation');
        return data;
      }
      
      // Calculate percentages for holders if we have totalSupply and decimals
      if (data.totalSupply && data.holders.length > 0) {
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
      } else if (!data.totalSupply) {
        console.log('⚠️ Cannot calculate percentages - missing totalSupply');
        console.log(`   Holders available: ${data.holders.length}`);
      }
      
      return data;
    } catch (error) {
      console.error(`Blockchain service error for ${network}:`, error.message);
      return {
        name: null,
        symbol: null,
        totalSupply: null,
        holders: [],
        creatorAddress: null,
        liquidity: null,
        error: error.message
      };
    }
  }

  getNetworkColor(network) {
    const colors = {
      'eth': '\x1b[36m',
      'bsc': '\x1b[33m',
      'polygon': '\x1b[35m',
      'arbitrum': '\x1b[34m',
      'avalanche': '\x1b[31m',
      'base': '\x1b[34m',
      'optimism': '\x1b[31m',
      'fantom': '\x1b[36m',
      'cronos': '\x1b[35m',
      'moonbeam': '\x1b[32m',
      'moonriver': '\x1b[33m',
      'gnosis': '\x1b[32m',
      'celo': '\x1b[33m',
      'linea': '\x1b[34m',
      'scroll': '\x1b[36m',
      'zksync': '\x1b[35m',
      'mantle': '\x1b[32m'
    };
    return colors[network.toLowerCase()] || '\x1b[37m';
  }

  async parseFromWeb(contractAddress, network) {
    try {
      const baseUrl = this.getScanUrl(network, contractAddress);
      const holdersUrl = `${baseUrl}#balances`;
      const color = this.getNetworkColor(network);
      const reset = '\x1b[0m';
      
      console.log(`${color}\n╔═══════════════════════════════════════════════════════════════╗`);
      console.log(`║ FETCHING HOLDER DATA FROM BLOCKCHAIN EXPLORER`);
      console.log(`╠═══════════════════════════════════════════════════════════════╣`);
      console.log(`║ Contract: ${contractAddress}`);
      console.log(`║ Network: ${network.toUpperCase()}`);
      console.log(`║ Base URL: ${baseUrl}`);
      console.log(`╚═══════════════════════════════════════════════════════════════╝${reset}\n`);
      
      let holders = [];
      const iframeUrl = this.getHoldersIframeUrl(network, contractAddress);
      
      console.log(`${color}\n📍 SOURCE URL FOR HOLDERS DATA:`);
      console.log(`   ${iframeUrl}`);
      console.log(`\n🔄 Attempting to fetch holder data...${reset}\n`);
      
      // ========================================
      // PRIMARY METHOD: NEW holderConcentrationService
      // ========================================
      console.log(`${color}🆕 TRYING NEW holderConcentrationService (PRIMARY)...${reset}`);
      try {
        const holderAnalysis = await holderConcentrationService.analyzeHolderConcentration({
          network: network,
          address: contractAddress,
          symbol: 'ANALYZING'
        });
        
        if (holderAnalysis.success) {
          console.log(`${color}✅ NEW service succeeded (${holderAnalysis.method})!${reset}`);
          console.log(`${color}   Top 1: ${holderAnalysis.holderConcentration.top1Percentage}%${reset}`);
          console.log(`${color}   Top 10: ${holderAnalysis.holderConcentration.top10Percentage}%${reset}`);
          console.log(`${color}   Holders: ${holderAnalysis.holderConcentration.top10Holders.length}${reset}`);
          
          holders = holderAnalysis.holderConcentration.top10Holders.map(h => ({
            rank: h.rank,
            address: h.address,
            balance: h.balance,
            percentage: h.percentage,
            label: h.label,
            isExchange: h.isExchange,
            isBlackhole: h.isBlackhole,
            isContract: h.isContract,
            type: h.type
          }));
          
          console.log(`${color}✅ Using NEW service data - skipping old methods${reset}`);
        } else {
          console.log(`${color}⚠️ NEW service failed: ${holderAnalysis.error}${reset}`);
          console.log(`${color}🔄 Falling back to OLD methods...${reset}`);
        }
      } catch (newServiceError) {
        console.error(`${color}❌ NEW service error: ${newServiceError.message}${reset}`);
        console.log(`${color}🔄 Falling back to OLD methods...${reset}`);
      }
      
      // ========================================
      // FALLBACK: OLD methods (only if NEW service failed)
      // ========================================
      if (holders.length === 0) {
        console.log(`${color}\n🔄 NEW service returned no holders, trying OLD AI parser...${reset}`);
        
        // Try OLD AI parsing
        if (process.env.OPENROUTER_API_KEY) {
          try {
            console.log(`${color}🤖 Attempting OLD AI parser on ${network} network...${reset}`);
            console.log(`${color}   URL: ${holdersUrl}${reset}`);
            const aiResult = await aiHtmlParser.parseTokenPageFromUrl(holdersUrl, network, contractAddress);
          
            if (aiResult && aiResult.success && aiResult.holderConcentration && aiResult.holderConcentration.top10Holders) {
              const aiHolders = aiResult.holderConcentration.top10Holders;
              console.log(`${color}✅ OLD AI parser extracted ${aiHolders.length} holders${reset}`);
              holders = aiHolders;
            } else {
              console.log(`${color}⚠️ OLD AI parser returned no valid holders${reset}`);
            }
          } catch (aiError) {
            console.log(`${color}⚠️ OLD AI parser failed: ${aiError.message}${reset}`);
          }
        }
      }
      
      // If still no holders, try traditional scraping
      if (holders.length === 0) {
        try {
          console.log(`${color}🌐 Using htmlFetcher to get iframe content...${reset}`);
          const htmlFetcher = require('./htmlFetcher');
          const fetchResult = await htmlFetcher.fetchHtml(iframeUrl, {
            waitForSelector: 'tbody',
            waitTime: 2000,
            timeout: 20000
          });
          
          if (!fetchResult.success) {
            throw new Error(fetchResult.error);
          }
          
          console.log(`${color}✅ Iframe HTML received (${fetchResult.html.length} bytes)${reset}`);
          
          // Debug: Save HTML to file for inspection and show first 1000 chars
          const fs = require('fs');
          const debugPath = `debug_${network}_${contractAddress.substring(0, 10)}.html`;
          fs.writeFileSync(debugPath, fetchResult.html);
          console.log(`${color}💾 Saved HTML to ${debugPath} for debugging${reset}`);
          
          // Show HTML preview
          console.log(`${color}\n📄 HTML PREVIEW (first 1000 chars):${reset}`);
          console.log(fetchResult.html.substring(0, 1000));
          console.log(`${color}...${reset}\n`);
          
          // Check if HTML contains table
          if (fetchResult.html.includes('<tbody>')) {
            console.log(`${color}✅ HTML contains <tbody> tag${reset}`);
          } else {
            console.log(`${color}⚠️ HTML does NOT contain <tbody> tag${reset}`);
          }
          
          if (fetchResult.html.includes('data-highlight-target')) {
            console.log(`${color}✅ HTML contains holder addresses${reset}`);
          } else {
            console.log(`${color}⚠️ HTML does NOT contain holder addresses${reset}`);
          }
          
          holders = this.extractTopHolders(fetchResult.html, contractAddress, network);
          console.log(`${color}📊 Extracted ${holders.length} holders from iframe${reset}`);
        
        if (holders.length > 0) {
          console.log(`✅ Top holder: ${holders[0].address} - Balance: ${holders[0].balance}`);
        } else {
          console.log(`⚠️ No holders extracted from iframe HTML, trying Puppeteer...`);
          
          // Try Puppeteer as fallback for Polygon and other chains
          try {
            console.log('🔄 Attempting Puppeteer scraping...');
            const puppeteerHolders = await puppeteerScraper.scrapeTokenHolders(holdersUrl, contractAddress);
            if (puppeteerHolders && puppeteerHolders.length > 0) {
              holders = puppeteerHolders;
              console.log(`✅ Puppeteer extracted ${holders.length} holders`);
            }
          } catch (puppeteerError) {
            console.log(`⚠️ Puppeteer also failed: ${puppeteerError.message}`);
          }
        }
      } catch (iframeError) {
        console.error(`❌ IFRAME FETCH FAILED: ${iframeError.message}`);
        console.log('🔄 Trying Puppeteer as fallback...');
        
        try {
          const puppeteerHolders = await puppeteerScraper.scrapeTokenHolders(holdersUrl, contractAddress);
          if (puppeteerHolders && puppeteerHolders.length > 0) {
            holders = puppeteerHolders;
            console.log(`✅ Puppeteer extracted ${holders.length} holders`);
          }
        } catch (puppeteerError) {
          console.log(`⚠️ Puppeteer also failed: ${puppeteerError.message}`);
          holders = [];
        }
      }
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
      
      console.log(`${color}\n═══ EXTRACTION SUMMARY ═══`);
      console.log(`Token: ${name || 'Unknown'} (${symbol || 'N/A'})`);
      console.log(`Holders: ${holders.length}`);
      console.log(`Total Supply: ${totalSupply || 'Not found'}${reset}`);
      
      // Verify holders were actually extracted
      if (holders.length === 0) {
        console.log(`${color}❌ No holders were extracted from HTML${reset}`);
      }
      
      return {
        name: name || null,
        symbol: symbol || null,
        totalSupply: totalSupply,
        holders: holders,
        holdersSourceUrl: holdersUrl,
        creatorAddress: null,
        liquidity: null
      };
    } catch (error) {
      console.log(`❌ Web parsing failed for ${network}:`, error.message);
      return {
        name: null,
        symbol: null,
        totalSupply: null,
        holders: [],
        creatorAddress: null,
        liquidity: null,
        error: error.message
      };
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
      'fantom': `https://ftmscan.com/token/${address}`,
      'cronos': `https://cronoscan.com/token/${address}`,
      'moonbeam': `https://moonscan.io/token/${address}`,
      'moonriver': `https://moonriver.moonscan.io/token/${address}`,
      'gnosis': `https://gnosisscan.io/token/${address}`,
      'celo': `https://celoscan.io/token/${address}`,
      'linea': `https://lineascan.build/token/${address}`,
      'scroll': `https://scrollscan.com/token/${address}`,
      'zksync': `https://explorer.zksync.io/token/${address}`,
      'mantle': `https://explorer.mantle.xyz/token/${address}`
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
      'fantom': `https://ftmscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'cronos': `https://cronoscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'moonbeam': `https://moonscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'moonriver': `https://moonriver.moonscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'gnosis': `https://gnosisscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'celo': `https://celoscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'linea': `https://lineascan.build/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'scroll': `https://scrollscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'zksync': `https://explorer.zksync.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'mantle': `https://explorer.mantle.xyz/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`
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

  extractTopHolders(html, contractAddress, network = 'eth') {
    const holders = [];
    const contractAddressLower = contractAddress.toLowerCase();
    const color = this.getNetworkColor(network);
    const reset = '\x1b[0m';
    
    console.log(`${color}\n=== BLOCKCHAIN HOLDER EXTRACTION PROCESS ===`);
    console.log(`Contract: ${contractAddress}`);
    console.log(`Network: ${network.toUpperCase()}`);
    console.log(`HTML Size: ${html.length} bytes`);
    console.log(`Step 1: Locating <tbody> in HTML...${reset}`);
    
    console.log(`${color}=== OWNERSHIP ANALYSIS PROCESS ===`);
    console.log(`Step 1: Check if holders data exists${reset}`);
    
    const tbodyPattern = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i;
    const tbodyMatch = html.match(tbodyPattern);
    
    if (!tbodyMatch) {
      console.log(`${color}❌ tbody not found in HTML${reset}`);
      const fs = require('fs');
      fs.writeFileSync(`debug_holders_${network}_page.html`, html);
      console.log(`${color}💾 Saved HTML to debug_holders_${network}_page.html for debugging${reset}`);
      console.log(`${color}⚠️ No holders data available${reset}`);
      return [];
    }
    
    console.log(`${color}✓ tbody found, proceeding to extract rows...${reset}`);
    
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
      
      // Extract label from the address cell
      let labelMatch = null;
      
      // Extract the title attribute from tooltip if it exists
      const titleMatch = cells[1].match(/data-bs-toggle=['"]tooltip['"][^>]*title=['"]([^'"]+)['"]/);
      if (titleMatch && titleMatch[1]) {
        let label = titleMatch[1].trim();
        // Clean HTML entities and check if it's a valid label
        label = label.replace(/&#10;.*/g, '').trim(); // Remove everything after line break
        if (label.length > 0 && !label.startsWith('0x') && !/^[0-9a-fA-F]{40}$/.test(label)) {
          labelMatch = label;
        }
      }
      
      // If no tooltip title, try alt attribute from img tag
      if (!labelMatch) {
        const altMatch = cells[1].match(/alt=['"]([^'"]+)['"]/);
        if (altMatch && altMatch[1]) {
          let label = altMatch[1].trim();
          if (label.length > 2 && !label.startsWith('0x')) {
            labelMatch = label;
          }
        }
      }
      
      // If still no label, try data-bs-title attribute
      if (!labelMatch) {
        const bsTitleMatch = cells[1].match(/data-bs-title=['"]([^'"]+)['"]/);
        if (bsTitleMatch && bsTitleMatch[1]) {
          let label = bsTitleMatch[1].trim();
          if (label.length > 2 && !label.startsWith('0x')) {
            labelMatch = label;
          }
        }
      }
      
      // Last resort: extract text from <a> tag
      if (!labelMatch) {
        const linkTextMatch = cells[1].match(/<a[^>]*href=['"][^'"]*\?a=0x[a-fA-F0-9]{40}['"][^>]*>([^<]+)<\/a>/);
        if (linkTextMatch && linkTextMatch[1]) {
          let label = linkTextMatch[1].trim();
          // Make sure it's not just an address abbreviation like "0x55Fa...4416"
          if (!label.match(/^0x[a-fA-F0-9]+\.{2,}[a-fA-F0-9]+$/)) {
            labelMatch = label;
          }
        }
      }
      
      // Extract address - try multiple patterns in order of reliability
      let addressMatch = null;
      let address = null;
      
      // Pattern 1: data-highlight-target attribute (most reliable)
      addressMatch = cells[1].match(/data-highlight-target=['"]?(0x[a-fA-F0-9]{40})['"]?/);
      if (addressMatch) {
        address = addressMatch[1];
      }
      
      // Pattern 2: href with ?a= parameter
      if (!address) {
        addressMatch = cells[1].match(/href=['"][^'"]*\?a=(0x[a-fA-F0-9]{40})['"]/);
        if (addressMatch) {
          address = addressMatch[1];
        }
      }
      
      // Pattern 3: title attribute containing address
      if (!address) {
        addressMatch = cells[1].match(/title=['"][^'"]*\((0x[a-fA-F0-9]{40})\)['"]/);
        if (addressMatch) {
          address = addressMatch[1];
        }
      }
      
      // Pattern 4: Any full address in the cell
      if (!address) {
        addressMatch = cells[1].match(/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) {
          address = addressMatch[1];
        }
      }
      if (!address) {
        console.log(`Row ${rowCount}: No address found`);
        continue;
      }
      
      // Check if this is the contract address or blackhole BEFORE any other processing
      const isContractAddress = address.toLowerCase() === contractAddressLower;
      const isBlackhole = this.isBlackholeAddress(address);
      
      if (isContractAddress) {
        console.log(`Row ${rowCount} (Rank ${rank}): Skipping contract address ${address}`);
        continue;
      }
      
      if (isBlackhole) {
        console.log(`Row ${rowCount} (Rank ${rank}): Skipping blackhole address ${address}`);
        continue;
      }
      const hasExchangeLabel = labelMatch && this.isExchangeLabel(labelMatch);
      
      const balanceText = cells[2].replace(/<[^>]*>/g, '').trim().replace(/,/g, '');
      const balance = balanceText || '0';
      
      // Don't extract percentage from HTML, we'll calculate it later from balance/totalSupply
      
      if (rowCount <= 5) {
        console.log(`\n━━━ DEBUG Row ${rowCount} (Rank ${rank}) ━━━`);
        console.log(`📍 Address: ${address}`);
        console.log(`🏷️  Label: ${labelMatch || 'None'}`);
        console.log(`💰 Balance: ${balance}`);
        console.log(`🔖 Type: ${hasExchangeLabel ? 'Exchange' : 'Regular'}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      }
      
      const balanceNum = parseFloat(balance);
      if (balanceNum <= 0 || isNaN(balanceNum)) {
        console.log(`Row ${rowCount} (Rank ${rank}): Invalid balance (${balance})`);
        continue;
      }
      
      const holderData = { 
        address, 
        balance, 
        percentage: 0,
        rank,
        label: labelMatch,
        isExchange: hasExchangeLabel,
        isBlackhole: false,
        isContract: false,
        type: hasExchangeLabel ? 'Exchange' : 'Regular'
      };
      
      holders.push(holderData);
      
      if (rowCount <= 3) {
        console.log(`✓ ADDED HOLDER ${rank}: ${address.substring(0, 10)}... - ${labelMatch || 'Unlabeled'}`);
      }
    }
    
    console.log(`${color}\n--- Extraction Summary ---`);
    console.log(`Total Rows Processed: ${rowCount}`);
    console.log(`Valid Holders Extracted: ${holders.length}${reset}`);
    
    if (holders.length > 0) {
      console.log(`${color}\nStep 2: Extract top holder information`);
      console.log(`Top Holder Data:`);
      console.log(`  Address: ${holders[0].address.substring(0, 42)}`);
      console.log(`  Percentage: 0.000% (will be calculated)`);
      console.log(`  Label: ${holders[0].label || 'Unknown'}`);
      console.log(`  Is Exchange: ${holders[0].isExchange}`);
      console.log(`  Balance: ${holders[0].balance}`);
      
      console.log(`\n--- Label Extraction Verification (Top 5) ---`);
      holders.slice(0, 5).forEach(h => {
        console.log(`  Rank ${h.rank}: ${h.label || 'Unknown'} (${h.address.substring(0, 12)}...)`);
      });
      
      console.log(`\n--- Holder Type Breakdown (Top ${holders.length}) ---`);
      const regularCount = holders.filter(h => !h.isExchange).length;
      const exchangeCount = holders.filter(h => h.isExchange).length;
      console.log(`  Regular: ${regularCount}`);
      console.log(`  Exchange: ${exchangeCount}`);
      
      console.log(`\n=== OWNERSHIP ANALYSIS COMPLETE ===${reset}`);
      return holders;
    } else {
      console.log(`${color}⚠️ No valid holders found`);
      console.log('=== OWNERSHIP ANALYSIS COMPLETE (NO DATA) ===\n${reset}');
      return [];
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
    
    return holders;
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
    
    return holders;
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
    console.log('⚠️ generateMockHolders called - returning empty array instead');
    return [];
  }

  generateRealisticMockData(contractAddress) {
    console.log('⚠️ generateRealisticMockData called - returning empty data instead');
    return {
      name: null,
      symbol: null,
      totalSupply: null,
      holders: [],
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
      name: null,
      symbol: null,
      totalSupply: null,
      holders: [],
      creatorAddress: null,
      liquidity: null
    };
  }
}

module.exports = new BlockchainService();