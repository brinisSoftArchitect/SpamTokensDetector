// services/solanaHolderService.js - Solana blockchain holder concentration service
const https = require('https');
const http = require('http');

class SolanaHolderService {
  constructor() {
    this.solscanApiBase = 'https://api-v2.solscan.io';
    this.publicApiBase = 'https://public-api.solscan.io';
  }

  /**
   * Analyze Solana token holder concentration
   * @param {string} tokenAddress - Solana token mint address
   * @returns {Object} - Complete analysis result
   */
  async analyzeHolderConcentration(tokenAddress) {
    try {
      console.log(`\n=== SOLANA HOLDER ANALYSIS ===`);
      console.log(`Token: ${tokenAddress}`);
      
      // Step 1: Fetch holder data from Solscan API
      const holdersData = await this.fetchHolders(tokenAddress);
      
      if (!holdersData.success) {
        return {
          success: false,
          error: 'Failed to fetch Solana holders',
          details: holdersData.error
        };
      }

      // Step 2: Fetch token metadata
      const tokenInfo = await this.fetchTokenInfo(tokenAddress);
      
      // Step 3: Process and analyze holders
      const analysis = this.processHolders(
        holdersData.holders,
        tokenInfo.totalSupply,
        tokenInfo.decimals
      );

      return {
        success: true,
        method: 'Solana',
        tokenInfo: {
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          contractAddress: tokenAddress,
          totalSupply: tokenInfo.totalSupply,
          decimals: tokenInfo.decimals,
          tokenType: 'SPL Token'
        },
        holderConcentration: analysis,
        network: 'solana',
        address: tokenAddress
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        network: 'solana',
        address: tokenAddress
      };
    }
  }

  /**
   * Fetch holders from Solscan API with proper headers
   */
  async fetchHolders(tokenAddress, pageSize = 10, page = 1) {
    try {
      const url = `${this.solscanApiBase}/v2/token/holders`;
      const params = `address=${tokenAddress}&page_size=${pageSize}&page=${page}`;
      const fullUrl = `${url}?${params}`;
      
      console.log(`Fetching: ${fullUrl}`);
      
      const response = await this.makeRequest(fullUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://solscan.io',
        'Referer': `https://solscan.io/token/${tokenAddress}`,
        'authority': 'api-v2.solscan.io',
        'method': 'GET',
        'path': `/v2/token/holders?address=${tokenAddress}&page_size=${pageSize}&page=${page}`,
        'scheme': 'https'
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch holders');
      }

      // Log raw response for debugging
      console.log('\n=== RAW SOLSCAN RESPONSE ===');
      console.log('Response length:', response.data.length);
      console.log('First 500 chars:', response.data.substring(0, 500));
      console.log('================================\n');
      
      const data = JSON.parse(response.data);
      
      // Log parsed data structure
      console.log('\n=== PARSED SOLSCAN DATA ===');
      console.log('Success:', data.success);
      console.log('Has data:', !!data.data);
      console.log('Has data.data:', !!(data.data && data.data.data));
      if (data.data && data.data.data) {
        console.log('Holders count:', data.data.data.length);
        if (data.data.data.length > 0) {
          console.log('\nFirst holder sample:');
          console.log(JSON.stringify(data.data.data[0], null, 2));
        }
      }
      console.log('================================\n');
      
      if (!data.success || !data.data || !data.data.data) {
        throw new Error('Invalid response format from Solscan');
      }

      const holders = data.data.data.map((holder, index) => {
        console.log(`\nHolder ${index + 1}:`);
        console.log(`  Address: ${holder.address}`);
        console.log(`  Amount: ${holder.amount}`);
        console.log(`  Decimals: ${holder.decimals}`);
        console.log(`  Owner: ${holder.owner || 'N/A'}`);
        
        return {
          rank: index + 1,
          address: holder.address || '',
          balance: holder.amount || '0',
          percentage: 0,
          decimals: holder.decimals || 0,
          owner: holder.owner || null
        };
      });

      console.log(`✓ Fetched ${holders.length} holders`);
      
      return {
        success: true,
        holders: holders,
        metadata: data.data.metadata || {}
      };

    } catch (error) {
      console.error(`Solscan API error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch token metadata from Solscan
   */
  async fetchTokenInfo(tokenAddress) {
    try {
      const url = `${this.solscanApiBase}/v2/token/meta`;
      const params = `address=${tokenAddress}`;
      const fullUrl = `${url}?${params}`;
      
      const response = await this.makeRequest(fullUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Origin': 'https://solscan.io',
        'Referer': `https://solscan.io/token/${tokenAddress}`
      });

      if (!response.success) {
        return this.getDefaultTokenInfo();
      }

      const data = JSON.parse(response.data);
      
      if (!data.success || !data.data) {
        return this.getDefaultTokenInfo();
      }

      const tokenData = data.data;
      
      return {
        name: tokenData.name || 'Unknown',
        symbol: tokenData.symbol || 'UNKNOWN',
        decimals: tokenData.decimals || 9,
        totalSupply: tokenData.supply || '0'
      };

    } catch (error) {
      console.error(`Token info fetch error: ${error.message}`);
      return this.getDefaultTokenInfo();
    }
  }

  getDefaultTokenInfo() {
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 9,
      totalSupply: '0'
    };
  }

  /**
   * Make HTTP request with proper error handling
   */
  async makeRequest(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: headers,
        timeout: 30000
      };
      
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ success: true, data: data, status: res.statusCode });
          } else {
            resolve({ 
              success: false, 
              error: `HTTP ${res.statusCode}`,
              status: res.statusCode,
              data: data
            });
          }
        });
      });
      
      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });
      
      req.end();
    });
  }

  /**
   * Process holders and calculate concentration metrics
   */
  processHolders(holders, totalSupply, decimals) {
    if (!holders || holders.length === 0) {
      return this.getEmptyAnalysis();
    }

    const totalSupplyNum = parseFloat(totalSupply) || 0;
    
    // Calculate percentages
    const processedHolders = holders.map(holder => {
      const balanceNum = parseFloat(holder.balance) || 0;
      const adjustedBalance = balanceNum / Math.pow(10, decimals);
      const adjustedSupply = totalSupplyNum / Math.pow(10, decimals);
      const percentage = adjustedSupply > 0 ? (adjustedBalance / adjustedSupply) * 100 : 0;
      
      const isBlackhole = this.isBlackholeAddress(holder.address);
      
      return {
        ...holder,
        percentage: parseFloat(percentage.toFixed(4)),
        isExchange: false,
        isBlackhole: isBlackhole,
        isContract: false,
        type: isBlackhole ? 'Blackhole' : 'Regular',
        label: holder.owner || 'Unknown'
      };
    });

    const nonBlackholeHolders = processedHolders.filter(h => !h.isBlackhole);
    const top1 = nonBlackholeHolders[0];
    const top10Percentage = nonBlackholeHolders
      .slice(0, 10)
      .reduce((sum, h) => sum + h.percentage, 0);

    let concentrationLevel = 'LOW';
    let rugPullRisk = false;

    if (top1 && top1.percentage > 50) {
      concentrationLevel = 'CRITICAL';
      rugPullRisk = true;
    } else if (top1 && top1.percentage > 30) {
      concentrationLevel = 'HIGH';
      rugPullRisk = true;
    } else if (top10Percentage > 80) {
      concentrationLevel = 'HIGH';
    } else if (top10Percentage > 60) {
      concentrationLevel = 'MODERATE';
    }

    return {
      top1Percentage: top1 ? top1.percentage : 0,
      top1Address: top1 ? top1.address : '',
      top1Label: top1 ? top1.label : '',
      top1IsExchange: false,
      top1IsBlackhole: false,
      top1Type: top1 ? top1.type : '',
      top10Percentage: parseFloat(top10Percentage.toFixed(4)),
      rugPullRisk,
      concentrationLevel,
      top10Holders: processedHolders.slice(0, 10),
      blackholeCount: processedHolders.filter(h => h.isBlackhole).length,
      blackholePercentage: parseFloat(
        processedHolders
          .filter(h => h.isBlackhole)
          .reduce((sum, h) => sum + h.percentage, 0)
          .toFixed(4)
      ),
      holdersBreakdown: {
        total: processedHolders.length,
        regular: processedHolders.filter(h => h.type === 'Regular').length,
        exchanges: 0,
        contracts: 0,
        blackholes: processedHolders.filter(h => h.type === 'Blackhole').length
      }
    };
  }

  isBlackholeAddress(address) {
    if (!address) return false;
    const blackholes = [
      '11111111111111111111111111111111',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    ];
    return blackholes.includes(address);
  }

  getEmptyAnalysis() {
    return {
      top1Percentage: 0,
      top1Address: '',
      top1Label: '',
      top1IsExchange: false,
      top1IsBlackhole: false,
      top1Type: '',
      top10Percentage: 0,
      rugPullRisk: false,
      concentrationLevel: 'UNKNOWN',
      top10Holders: [],
      blackholeCount: 0,
      blackholePercentage: 0,
      holdersBreakdown: {
        total: 0,
        regular: 0,
        exchanges: 0,
        contracts: 0,
        blackholes: 0
      }
    };
  }
}

module.exports = new SolanaHolderService();