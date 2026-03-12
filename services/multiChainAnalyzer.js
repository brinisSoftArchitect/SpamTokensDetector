// services/multiChainAnalyzer.js - Multi-chain token analysis
const tokenAnalyzer = require('./tokenAnalyzer');
const gateioService = require('./gateioService');
const nativeTokenDataService = require('./nativeTokenDataService');
const aiRiskAnalyzer = require('./aiRiskAnalyzer');
const axios = require('axios');

class MultiChainAnalyzer {
  async analyzeNativeToken(symbol) {
    const axios = require('axios');
    
    const nativeTokens = {
      'BTC': {
        name: 'Bitcoin',
        network: 'bitcoin',
        isNative: true,
        explorer: 'https://mempool.space/',
        coingeckoId: 'bitcoin'
      },
      'MON': {
        name: 'Monad',
        network: 'monad',
        isNative: true,
        explorer: 'https://explorer.monad.xyz',
        coingeckoId: 'monad-2'
      },
      'ETH': {
        name: 'Ethereum',
        network: 'eth',
        isNative: true,
        explorer: 'https://etherscan.io',
        coingeckoId: 'ethereum'
      },
      'BNB': {
        name: 'Binance Coin',
        network: 'bsc',
        isNative: true,
        explorer: 'https://bscscan.com',
        coingeckoId: 'binancecoin'
      },
      'MATIC': {
        name: 'Polygon',
        network: 'polygon',
        isNative: true,
        explorer: 'https://polygonscan.com',
        coingeckoId: 'matic-network'
      },
      'AVAX': {
        name: 'Avalanche',
        network: 'avalanche',
        isNative: true,
        explorer: 'https://snowtrace.io',
        coingeckoId: 'avalanche-2'
      },
      'FTM': {
        name: 'Fantom',
        network: 'fantom',
        isNative: true,
        explorer: 'https://ftmscan.com',
        coingeckoId: 'fantom'
      },
      'KDA': {
        name: 'Kadena',
        network: 'kadena',
        isNative: true,
        explorer: 'https://explorer.chainweb.com',
        coingeckoId: 'kadena'
      },
      'SOL': {
        name: 'Solana',
        network: 'solana',
        isNative: true,
        explorer: 'https://explorer.solana.com',
        coingeckoId: 'solana'
      },
      'ADA': {
        name: 'Cardano',
        network: 'cardano',
        isNative: true,
        explorer: 'https://cardanoscan.io',
        coingeckoId: 'cardano'
      },
      'DOT': {
        name: 'Polkadot',
        network: 'polkadot',
        isNative: true,
        explorer: 'https://polkadot.subscan.io',
        coingeckoId: 'polkadot'
      },
      'XRP': {
        name: 'Ripple',
        network: 'xrp',
        isNative: true,
        explorer: 'https://xrpscan.com',
        coingeckoId: 'ripple'
      },
      'TRX': {
        name: 'Tron',
        network: 'tron',
        isNative: true,
        explorer: 'https://tronscan.org',
        coingeckoId: 'tron'
      },
      'ATOM': {
        name: 'Cosmos',
        network: 'cosmos',
        isNative: true,
        explorer: 'https://www.mintscan.io/cosmos',
        coingeckoId: 'cosmos'
      },
      'NEAR': {
        name: 'NEAR Protocol',
        network: 'near',
        isNative: true,
        explorer: 'https://explorer.near.org',
        coingeckoId: 'near'
      },
      'LTC': {
        name: 'Litecoin',
        network: 'litecoin',
        isNative: true,
        explorer: 'https://blockchair.com/litecoin',
        coingeckoId: 'litecoin'
      },
      'BCH': {
        name: 'Bitcoin Cash',
        network: 'bitcoin-cash',
        isNative: true,
        explorer: 'https://blockchair.com/bitcoin-cash',
        coingeckoId: 'bitcoin-cash'
      },
      'XLM': {
        name: 'Stellar',
        network: 'stellar',
        isNative: true,
        explorer: 'https://stellarchain.io',
        coingeckoId: 'stellar'
      },
      'ALGO': {
        name: 'Algorand',
        network: 'algorand',
        isNative: true,
        explorer: 'https://algoexplorer.io',
        coingeckoId: 'algorand'
      },
      'DOGE': {
        name: 'Dogecoin',
        network: 'dogecoin',
        isNative: true,
        explorer: 'https://blockchair.com/dogecoin',
        coingeckoId: 'dogecoin'
      },
      'XMR': {
        name: 'Monero',
        network: 'monero',
        isNative: true,
        explorer: 'https://xmrchain.net',
        coingeckoId: 'monero'
      },
      'CRO': {
        name: 'Cronos',
        network: 'cronos',
        isNative: true,
        explorer: 'https://cronoscan.com',
        coingeckoId: 'crypto-com-chain'
      },
      'FTM': {
        name: 'Fantom',
        network: 'fantom',
        isNative: true,
        explorer: 'https://ftmscan.com',
        coingeckoId: 'fantom'
      },
      'OP': {
        name: 'Optimism',
        network: 'optimism',
        isNative: true,
        explorer: 'https://optimistic.etherscan.io',
        coingeckoId: 'optimism'
      },
      'ARB': {
        name: 'Arbitrum',
        network: 'arbitrum',
        isNative: true,
        explorer: 'https://arbiscan.io',
        coingeckoId: 'arbitrum'
      }
    };

    const upperSymbol = symbol.toUpperCase();
    const nativeInfo = nativeTokens[upperSymbol];

    if (nativeInfo) {
      console.log(`\n🔍 Detected native blockchain token: ${upperSymbol}`);
      console.log(`   Network: ${nativeInfo.network}`);
      console.log(`   Explorer: ${nativeInfo.explorer}`);
      console.log(`   CoinGecko ID: ${nativeInfo.coingeckoId}\n`);
      
      // Try to fetch market data
      let marketData = await nativeTokenDataService.fetchFromMultipleSources(upperSymbol, nativeInfo.coingeckoId);
      
      // Enhance with blockchain explorer data using AI
      console.log(`\n🌐 Fetching blockchain explorer data for ${upperSymbol}...`);
      const explorerData = await this.parseExplorerWithAI(upperSymbol, nativeInfo);
      
      // If market data fetch failed, use AI to gather information
      if (!marketData.marketCapRaw || marketData.marketCapRaw === 0) {
        console.log(`\n⚠️ Market data unavailable for ${upperSymbol}`);
        console.log(`🤖 Attempting AI-powered data gathering...\n`);
        marketData = await this.useAIForNativeToken(upperSymbol, nativeInfo);
      } else {
        console.log(`\n✅ Native token analysis complete for ${upperSymbol}`);
        console.log(`   Data successfully gathered from CoinGecko API\n`);
      }
      
      // Merge explorer data with market data
      if (explorerData && explorerData.success) {
        marketData = { ...marketData, ...explorerData.data };
      }
      
      const exchanges = marketData.exchanges || [];
      
      const volumeToMarketCapRatio = (marketData.marketCapRaw && marketData.volume24hRaw) 
        ? (marketData.volume24hRaw / marketData.marketCapRaw) 
        : null;
      
      const gapHunterRisk = this.calculateNativeTokenRisk(marketData, volumeToMarketCapRatio);
      
      return {
        success: true,
        symbol: upperSymbol,
        isNativeToken: true,
        chainsFound: 1,
        tokenInfo: {
          name: nativeInfo.name,
          symbol: upperSymbol,
          network: nativeInfo.network,
          type: 'Native Blockchain Token',
          description: `${nativeInfo.name} is the native cryptocurrency of the ${nativeInfo.network} blockchain.`,
          verified: true
        },
        marketData: {
          marketCap: marketData.marketCap || 'N/A',
          marketCapRaw: marketData.marketCapRaw || null,
          volume24h: marketData.volume24h || 'N/A',
          volume24hRaw: marketData.volume24hRaw || null,
          volumeToMarketCapRatio: volumeToMarketCapRatio,
          volumeToMarketCapPercentage: volumeToMarketCapRatio ? `${(volumeToMarketCapRatio * 100).toFixed(2)}%` : null,
          priceChange24h: marketData.priceChange24h || null,
          currentPrice: marketData.currentPrice || null,
          liquidityRisk: this.assessNativeLiquidityRisk(marketData.marketCapRaw),
          volumeAnomalyDetected: volumeToMarketCapRatio ? (volumeToMarketCapRatio > 2 || volumeToMarketCapRatio < 0.001) : false,
          circulatingSupply: marketData.circulatingSupply ? marketData.circulatingSupply.toLocaleString('en-US') : null,
          totalSupply: marketData.totalSupply ? marketData.totalSupply.toLocaleString('en-US') : null,
          maxSupply: marketData.maxSupply ? marketData.maxSupply.toLocaleString('en-US') : null,
          ath: marketData.ath ? `${marketData.ath}` : null,
          athDate: marketData.athDate || null,
          atl: marketData.atl ? `${marketData.atl}` : null,
          atlDate: marketData.atlDate || null,
          marketCapRank: marketData.marketCapRank || null,
          fullyDilutedValuation: marketData.fullyDilutedValuation ? marketData.fullyDilutedValuation.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null
        },
        exchanges: exchanges,
        gapHunterBotRisk: gapHunterRisk,
        ownershipAnalysis: marketData.ownershipAnalysis || {
          note: 'Native blockchain tokens do not have traditional holder concentration metrics as they are distributed through mining/staking/validation mechanisms',
          isDecentralized: true,
          concentrationLevel: 'DECENTRALIZED',
          topOwnerPercentage: 0,
          top10Percentage: 0
        },
        holderConcentration: marketData.holderConcentration || {
          top1Percentage: 0,
          top1Address: null,
          top1Label: null,
          top1IsExchange: false,
          top10Percentage: 0,
          rugPullRisk: false,
          concentrationLevel: 'DECENTRALIZED'
        },
        holdersSourceUrl: marketData.holdersSourceUrl || nativeInfo.explorer,
        explorer: nativeInfo.explorer,
        allExplorers: [{
          network: nativeInfo.network,
          url: nativeInfo.explorer
        }],
        dataSources: {
          coinGecko: marketData.fromCoinGecko || false,
          coinMarketCap: false,
          blockchain: false,
          ai: marketData.fromAI || false
        },
        summary: `${nativeInfo.name} (${upperSymbol}) is the native Layer 1 cryptocurrency of the ${nativeInfo.network} blockchain with ${exchanges.length > 0 ? exchanges.length + ' exchange listings' : 'limited exchange data'}.`,
        blockchainDetails: marketData.blockchainDetails || null,
        aiEnhancedData: marketData.fromAI ? {
          description: marketData.description,
          launchDate: marketData.launchDate,
          consensusMechanism: marketData.consensusMechanism,
          blockTime: marketData.blockTime,
          transactionSpeed: marketData.transactionSpeed
        } : null
      };
      
      return nativeResult;
    }

    return null;
  }

  async useAIForNativeToken(symbol, nativeInfo) {
    try {
      console.log(`🤖 Using AI to gather data for ${symbol}...`);
      
      const prompt = `Provide comprehensive information about ${symbol} (${nativeInfo.name}) cryptocurrency. Return ONLY a valid JSON object with this structure (no markdown, no explanation):

{
  "marketCap": "estimated market cap in USD as string",
  "marketCapRaw": estimated_market_cap_number,
  "volume24h": "estimated 24h volume in USD as string",
  "volume24hRaw": estimated_volume_number,
  "currentPrice": "current price in USD",
  "priceChange24h": "24h price change percentage",
  "circulatingSupply": "circulating supply",
  "totalSupply": "total supply",
  "maxSupply": "max supply or null",
  "ath": "all time high price",
  "athDate": "ATH date",
  "atl": "all time low price",
  "atlDate": "ATL date",
  "marketCapRank": rank_number,
  "description": "brief description of the token and its blockchain",
  "exchanges": ["list", "of", "major", "exchanges"],
  "launchDate": "launch date",
  "consensusMechanism": "PoW/PoS/etc",
  "blockTime": "average block time",
  "transactionSpeed": "TPS or transaction speed info"
}`;

      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message.content.trim();
      
      let jsonText = responseText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
      }

      const aiData = JSON.parse(jsonText);
      console.log(`\n✅ AI successfully gathered data for ${symbol}:`);
      console.log(`   Market Cap: ${aiData.marketCap}`);
      console.log(`   Current Price: ${aiData.currentPrice}`);
      console.log(`   24h Volume: ${aiData.volume24h}`);
      console.log(`   Exchanges: ${aiData.exchanges?.length || 0}`);
      console.log(`   Data Source: AI (OpenRouter)\n`);
      
      return {
        ...aiData,
        fromAI: true
      };

    } catch (error) {
      console.error(`❌ AI data gathering failed for ${symbol}:`, error.message);
      return {
        marketCap: null,
        marketCapRaw: null,
        volume24h: null,
        volume24hRaw: null,
        currentPrice: null,
        priceChange24h: null,
        exchanges: [],
        fromAI: false,
        aiError: error.message
      };
    }
  }

  async parseExplorerWithAI(symbol, nativeInfo) {
    const puppeteer = require('puppeteer');
    let browser = null;
    let page = null;
    
    try {
      console.log(`🤖 Launching browser to fetch ${nativeInfo.explorer}...`);
      
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      
      console.log(`📡 Loading ${nativeInfo.explorer}...`);
      await page.goto(nativeInfo.explorer, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);
      
      const html = await page.content();
      console.log(`✅ Downloaded explorer page (${html.length} bytes)`);
      
      // Save HTML to debug file
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(__dirname, '../debug-ai-parser');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      // const htmlPath = path.join(debugDir, `${symbol}-explorer.html`);
      // fs.writeFileSync(htmlPath, html);
      // console.log(`💾 Saved HTML to: ${htmlPath}`);
      
      await browser.close();
      
      console.log(`🤖 Using AI to parse explorer data for ${symbol}...`);
      
      
      const prompt = `Analyze this blockchain explorer homepage and extract comprehensive blockchain and holder information.

Blockchain: ${nativeInfo.name} (${symbol})
Explorer URL: ${nativeInfo.explorer}

HTML Content (first 40000 chars):
${html.substring(0, 40000)}

Extract and return ONLY a valid JSON object with this EXACT structure (no markdown, no explanation):
{
  "ownershipAnalysis": {
    "topOwnerPercentage": 0,
    "topOwnerAddress": "string or null",
    "topOwnerLabel": "string or null",
    "isExchange": false,
    "concentrated": false,
    "top10Percentage": 0,
    "note": "Native blockchain tokens are distributed through mining/staking/validation",
    "holders": [
      {
        "rank": 1,
        "address": "string",
        "balance": "string",
        "percentage": 0.00
      }
    ]
  },
  "holderConcentration": {
    "top1Percentage": 0,
    "top1Address": "string or null",
    "top1Label": "string or null",
    "top1IsExchange": false,
    "top10Percentage": 0,
    "rugPullRisk": false,
    "concentrationLevel": "DECENTRALIZED"
  },
  "blockchainStats": {
    "currentBlockHeight": "number or null",
    "totalTransactions": "number or null",
    "activeAddresses": "number or null",
    "averageBlockTime": "seconds or null",
    "hashRate": "string or null",
    "difficulty": "string or null",
    "chainId": "string or null",
    "totalSupply": "string or null",
    "circulatingSupply": "string or null"
  },
  "recentActivity": {
    "recentBlocks": "number of blocks found",
    "transactionsPerSecond": "number or null",
    "last24hTransactions": "number or null"
  },
  "networkHealth": {
    "status": "operational/degraded/down",
    "nodeCount": "number or null",
    "peersConnected": "number or null"
  },
  "holdersSourceUrl": "${nativeInfo.explorer}"
}`;

      // Save AI query to debug file
      const queryPath = path.join(debugDir, `${symbol}-ai-query.txt`);
      fs.writeFileSync(queryPath, prompt);
      console.log(`💾 Saved AI query to: ${queryPath}`);

      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: prompt }]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const responseText = response.data.choices[0].message.content.trim();
      
      // Save AI response to debug file
      const responsePath = path.join(debugDir, `${symbol}-ai-response.txt`);
      fs.writeFileSync(responsePath, responseText);
      console.log(`💾 Saved AI response to: ${responsePath}`);
      
      let jsonText = responseText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim();
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim();
      }

      const explorerData = JSON.parse(jsonText);
      
      // Save parsed JSON to debug file
      const jsonPath = path.join(debugDir, `${symbol}-parsed-data.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(explorerData, null, 2));
      console.log(`💾 Saved parsed JSON to: ${jsonPath}`);
      
      console.log(`\n✅ AI successfully parsed explorer data for ${symbol}:`);
      
      if (explorerData.holderConcentration) {
        console.log(`\n   📊 Holder Analysis:`);
        console.log(`      Top 1 Holder: ${explorerData.holderConcentration.top1Percentage || 0}%`);
        console.log(`      Top 10 Holders: ${explorerData.holderConcentration.top10Percentage || 0}%`);
        console.log(`      Concentration: ${explorerData.holderConcentration.concentrationLevel || 'N/A'}`);
        console.log(`      Holders Found: ${explorerData.ownershipAnalysis?.holders?.length || 0}`);
      }
      
      if (explorerData.blockchainStats) {
        console.log(`\n   ⛓️  Blockchain Stats:`);
        console.log(`      Current Block: ${explorerData.blockchainStats.currentBlockHeight || 'N/A'}`);
        console.log(`      Total Transactions: ${explorerData.blockchainStats.totalTransactions || 'N/A'}`);
        console.log(`      Active Addresses: ${explorerData.blockchainStats.activeAddresses || 'N/A'}`);
        console.log(`      Avg Block Time: ${explorerData.blockchainStats.averageBlockTime || 'N/A'}s`);
      }
      
      if (explorerData.networkHealth) {
        console.log(`\n   🏥 Network Health:`);
        console.log(`      Status: ${explorerData.networkHealth.status || 'N/A'}`);
        console.log(`      Nodes: ${explorerData.networkHealth.nodeCount || 'N/A'}`);
      }
      
      console.log(`\n   Data Source: AI parsing of ${nativeInfo.explorer}\n`);
      
      return {
        success: true,
        data: {
          blockchainDetails: explorerData,
          ownershipAnalysis: explorerData.ownershipAnalysis || {
            note: 'Native blockchain tokens do not have traditional holder concentration metrics',
            isDecentralized: true,
            concentrationLevel: 'DECENTRALIZED',
            topOwnerPercentage: 0,
            top10Percentage: 0
          },
          holderConcentration: explorerData.holderConcentration || {
            top1Percentage: 0,
            top1Address: null,
            top1Label: null,
            top1IsExchange: false,
            top10Percentage: 0,
            rugPullRisk: false,
            concentrationLevel: 'DECENTRALIZED'
          },
          holdersSourceUrl: explorerData.holdersSourceUrl || nativeInfo.explorer
        }
      };

    } catch (error) {
      console.error(`❌ Explorer parsing failed for ${symbol}:`, error.message);
      
      // Save error to debug file
      try {
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '../debug-ai-parser');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        // const errorPath = path.join(debugDir, `${symbol}-error.txt`);
        // fs.writeFileSync(errorPath, `Error: ${error.message}\n\nStack: ${error.stack}`);
        // console.log(`💾 Saved error to: ${errorPath}`);
      } catch (e) {
        console.log('Could not save error file:', e.message);
      }
      
      if (browser) {
        try { await browser.close(); } catch (e) {}
      }
      return { success: false, error: error.message };
    }
  }

  async fetchNativeTokenMarketData(coingeckoId, symbol) {
    const axios = require('axios');
    
    try {
      console.log(`Fetching market data for ${symbol} (ID: ${coingeckoId})...`);
      
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coingeckoId}`, {
        params: {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const data = response.data;
      const marketData = data.market_data || {};
      
      const exchanges = [];
      if (data.tickers && Array.isArray(data.tickers)) {
        const seenExchanges = new Set();
        data.tickers.forEach(ticker => {
          if (ticker.market && ticker.market.name && !seenExchanges.has(ticker.market.name)) {
            seenExchanges.add(ticker.market.name);
            exchanges.push(ticker.market.name);
          }
        });
      }

      console.log(`✓ Market data retrieved for ${symbol}`);
      console.log(`  Market Cap: ${marketData.market_cap?.usd?.toLocaleString() || 'N/A'}`);
      console.log(`  24h Volume: ${marketData.total_volume?.usd?.toLocaleString() || 'N/A'}`);
      console.log(`  Exchanges: ${exchanges.length}`);

      return {
        marketCap: marketData.market_cap?.usd ? marketData.market_cap.usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
        marketCapRaw: marketData.market_cap?.usd || null,
        volume24h: marketData.total_volume?.usd ? marketData.total_volume.usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
        volume24hRaw: marketData.total_volume?.usd || null,
        priceChange24h: marketData.price_change_percentage_24h ? `${marketData.price_change_percentage_24h.toFixed(2)}%` : null,
        currentPrice: marketData.current_price?.usd ? `${marketData.current_price.usd}` : null,
        circulatingSupply: marketData.circulating_supply || null,
        totalSupply: marketData.total_supply || null,
        maxSupply: marketData.max_supply || null,
        ath: marketData.ath?.usd || null,
        athDate: marketData.ath_date?.usd || null,
        atl: marketData.atl?.usd || null,
        atlDate: marketData.atl_date?.usd || null,
        marketCapRank: marketData.market_cap_rank || null,
        exchanges: exchanges.slice(0, 20),
        fromCoinGecko: true
      };
    } catch (error) {
      console.log(`Failed to fetch market data for ${symbol}:`, error.message);
      return {
        marketCap: null,
        marketCapRaw: null,
        volume24h: null,
        volume24hRaw: null,
        priceChange24h: null,
        currentPrice: null,
        exchanges: [],
        fromCoinGecko: false
      };
    }
  }

  assessNativeLiquidityRisk(marketCap) {
    if (!marketCap) return 'UNKNOWN';
    if (marketCap < 10000) return 'CRITICAL';
    if (marketCap < 50000) return 'VERY_HIGH';
    if (marketCap < 100000) return 'HIGH';
    if (marketCap < 500000) return 'MODERATE';
    if (marketCap < 1000000) return 'LOW';
    if (marketCap < 10000000) return 'MINIMAL';
    return 'EXCELLENT';
  }

  calculateNativeTokenRisk(marketData, volumeToMarketCapRatio) {
    const marketCap = marketData.marketCapRaw || 0;
    const volume24h = marketData.volume24hRaw || 0;
    const volMcapPercentage = volumeToMarketCapRatio ? volumeToMarketCapRatio * 100 : 0;
    
    let M = 0;
    if (marketCap < 100000) {
      M = 100;
    } else if (marketCap < 1000000) {
      M = 70;
    } else if (marketCap < 10000000) {
      M = 40;
    } else if (marketCap < 100000000) {
      M = 20;
    } else {
      M = 0;
    }

    let V = 0;
    if (volume24h === 0 || volMcapPercentage === 0) {
      V = 100;
    } else if (volMcapPercentage < 0.1) {
      V = 90;
    } else if (volMcapPercentage < 1) {
      V = 60;
    } else if (volMcapPercentage < 5) {
      V = 30;
    } else if (volMcapPercentage >= 5 && volMcapPercentage <= 100) {
      V = 0;
    } else if (volMcapPercentage > 100 && volMcapPercentage <= 500) {
      V = 20;
    } else {
      V = 50;
    }

    const riskPercentage = (0.50 * M + 0.50 * V);
    const shouldSkip = riskPercentage >= 60;

    let recommendation = '';
    if (marketCap > 1000000000 && volMcapPercentage > 1) {
      recommendation = '✅ EXCELLENT - Major cryptocurrency with high liquidity';
    } else if (marketCap > 100000000 && volMcapPercentage > 1) {
      recommendation = '✅ GOOD - High liquidity native token';
    } else if (shouldSkip) {
      recommendation = '⚠️ CAUTION - Low liquidity for gap trading';
    } else {
      recommendation = '✅ ACCEPTABLE - Moderate liquidity';
    }

    return {
      riskPercentage: parseFloat(riskPercentage.toFixed(2)),
      shouldSkip: shouldSkip,
      hardSkip: false,
      hardSkipReasons: [],
      components: {
        M: { value: parseFloat(M.toFixed(2)), weight: '50%', description: 'Market cap risk' },
        V: { value: parseFloat(V.toFixed(2)), weight: '50%', description: 'Volume/MarketCap ratio' }
      },
      recommendation: recommendation,
      note: 'Native blockchain tokens have different risk profiles than smart contract tokens. This assessment focuses on liquidity and trading viability.'
    };
  }

  async analyzeBySymbol(symbol) {
    try {
      console.log(`\n=== Analyzing symbol: ${symbol} ===`);
      
      const nativeTokenAnalysis = await this.analyzeNativeToken(symbol);
      if (nativeTokenAnalysis) {
        return nativeTokenAnalysis;
      }
      
      // gateioService already tries CoinGecko + Gate.io scrape internally
      let contracts = await gateioService.getTokenBySymbol(symbol);
      
      if (contracts.length === 0) {
        console.log(`No contracts found for ${symbol}, trying CMC/CoinGecko market data only...`);
        
        // Try to gather market data even without a contract address
        try {
          const cmcService = require('./cmcService');
          const coingeckoSearchService = require('./coingeckoSearchService');
          
          const [cmcResult, cgResult] = await Promise.allSettled([
            cmcService.getTokenInfoBySymbol ? cmcService.getTokenInfoBySymbol(symbol) : Promise.reject('no method'),
            coingeckoSearchService.searchBySymbol ? coingeckoSearchService.searchBySymbol(symbol) : Promise.reject('no method')
          ]);
          
          const marketInfo = cmcResult.status === 'fulfilled' ? cmcResult.value
            : cgResult.status === 'fulfilled' ? cgResult.value
            : null;
          
          if (marketInfo && (marketInfo.marketCap || marketInfo.name)) {
            console.log(`[MultiChain] Got partial market data for ${symbol} (no contract)`);
            const volumeToMarketCapRatio = (marketInfo.marketCapRaw && marketInfo.volume24hRaw)
              ? marketInfo.volume24hRaw / marketInfo.marketCapRaw : null;
            
            return {
              success: true,
              symbol: symbol.toUpperCase(),
              chainsFound: 0,
              globalSpamScore: 30,
              overallRisk: 'UNKNOWN',
              isSpamGlobally: false,
              noContractFound: true,
              gapHunterBotRisk: {
                riskPercentage: 50,
                shouldSkip: true,
                hardSkip: false,
                hardSkipReasons: ['No contract address found — cannot verify on-chain'],
                recommendation: '⚠️ CAUTION - No contract found, limited data',
                components: {}
              },
              holderConcentration: {
                top1Percentage: 0, top1Address: null, top1Label: null,
                top1IsExchange: false, top10Percentage: 0, rugPullRisk: false,
                concentrationLevel: 'UNKNOWN',
                dataSource: 'none',
                note: 'No contract address found — holder data unavailable'
              },
              marketData: {
                marketCap: marketInfo.marketCap || null,
                marketCapRaw: marketInfo.marketCapRaw || null,
                volume24h: marketInfo.volume24h || null,
                volume24hRaw: marketInfo.volume24hRaw || null,
                volumeToMarketCapRatio,
                priceChange24h: marketInfo.priceChange24h || null,
                currentPrice: marketInfo.currentPrice || null,
                liquidityRisk: 'UNKNOWN',
                volumeAnomalyDetected: false
              },
              exchanges: marketInfo.exchanges || [],
              token: {
                name: marketInfo.name || symbol,
                symbol: symbol.toUpperCase(),
                contractAddress: null,
                network: null,
                verified: false
              },
              chains: [],
              summary: `No on-chain contract found for ${symbol}. Market data only — cannot perform full scam analysis.`,
              searchedSources: ['Gate.io', 'CoinGecko', 'Native Token Database']
            };
          }
        } catch(e) {
          console.log(`[MultiChain] Partial market data fetch failed: ${e.message}`);
        }
        
        // Last resort: try CoinGecko direct coin lookup for any market data
        try {
          const axios = require('axios');
          const cgSearchResp = await axios.get(`https://api.coingecko.com/api/v3/search`, {
            params: { query: symbol },
            timeout: 10000,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
          });
          const cgCoins = cgSearchResp.data?.coins || [];
          const exactCg = cgCoins.find(c => c.symbol?.toLowerCase() === symbol.toLowerCase());
          if (exactCg) {
            console.log(`[MultiChain] Found CoinGecko coin for ${symbol}: ${exactCg.id}`);
            const cgDetail = await axios.get(`https://api.coingecko.com/api/v3/coins/${exactCg.id}`, {
              params: { localization: false, tickers: true, market_data: true, community_data: false, developer_data: false },
              timeout: 15000,
              headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            const cd = cgDetail.data;
            const md = cd.market_data || {};
            const exchanges = [];
            const seenEx = new Set();
            (cd.tickers || []).forEach(t => {
              if (t.market?.name && !seenEx.has(t.market.name)) {
                seenEx.add(t.market.name);
                exchanges.push(t.market.name);
              }
            });
            const marketCapRaw = md.market_cap?.usd || null;
            const volume24hRaw = md.total_volume?.usd || null;
            const volumeToMarketCapRatio = (marketCapRaw && volume24hRaw) ? volume24hRaw / marketCapRaw : null;
            const links = cd.links?.blockchain_site?.filter(l => l && l.trim() !== '') || [];
            return {
              success: true,
              symbol: symbol.toUpperCase(),
              chainsFound: 0,
              globalSpamScore: 20,
              overallRisk: 'UNKNOWN',
              isSpamGlobally: false,
              noContractFound: true,
              gapHunterBotRisk: {
                riskPercentage: 40,
                shouldSkip: false,
                hardSkip: false,
                hardSkipReasons: [],
                recommendation: '⚠️ CAUTION - No EVM contract found, market data only',
                components: {}
              },
              holderConcentration: {
                top1Percentage: 0, top1Address: null, top1Label: null,
                top1IsExchange: false, top10Percentage: 0, rugPullRisk: false,
                concentrationLevel: 'UNKNOWN', dataSource: 'none',
                note: 'No EVM contract address found — holder data unavailable'
              },
              marketData: {
                marketCap: marketCapRaw ? marketCapRaw.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
                marketCapRaw,
                volume24h: volume24hRaw ? volume24hRaw.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
                volume24hRaw,
                volumeToMarketCapRatio,
                volumeToMarketCapPercentage: volumeToMarketCapRatio ? `${(volumeToMarketCapRatio * 100).toFixed(2)}%` : null,
                priceChange24h: md.price_change_percentage_24h ? `${md.price_change_percentage_24h.toFixed(2)}%` : null,
                currentPrice: md.current_price?.usd ? `${md.current_price.usd}` : null,
                circulatingSupply: md.circulating_supply ? md.circulating_supply.toLocaleString('en-US') : null,
                totalSupply: md.total_supply ? md.total_supply.toLocaleString('en-US') : null,
                maxSupply: md.max_supply ? md.max_supply.toLocaleString('en-US') : null,
                ath: md.ath?.usd ? `${md.ath.usd}` : null,
                athDate: md.ath_date?.usd || null,
                atl: md.atl?.usd ? `${md.atl.usd}` : null,
                atlDate: md.atl_date?.usd || null,
                marketCapRank: md.market_cap_rank || null,
                fullyDilutedValuation: md.fully_diluted_valuation?.usd ? md.fully_diluted_valuation.usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
                liquidityRisk: 'UNKNOWN',
                volumeAnomalyDetected: volumeToMarketCapRatio ? (volumeToMarketCapRatio > 2 || volumeToMarketCapRatio < 0.001) : false
              },
              token: {
                name: cd.name || symbol,
                symbol: symbol.toUpperCase(),
                contractAddress: null,
                network: null,
                verified: false,
                coingeckoId: exactCg.id,
                description: cd.description?.en ? cd.description.en.replace(/<[^>]*>/g, '').substring(0, 500) : null,
                categories: cd.categories || [],
                links: {
                  website: cd.links?.homepage?.filter(l => l)[0] || null,
                  twitter: cd.links?.twitter_screen_name ? `https://twitter.com/${cd.links.twitter_screen_name}` : null,
                  telegram: cd.links?.telegram_channel_identifier ? `https://t.me/${cd.links.telegram_channel_identifier}` : null,
                  reddit: cd.links?.subreddit_url || null,
                  github: cd.links?.repos_url?.github?.[0] || null,
                  blockchainExplorers: links
                }
              },
              exchanges: exchanges.slice(0, 20),
              chains: [],
              summary: `${cd.name} (${symbol.toUpperCase()}) — no EVM contract found. CoinGecko market data retrieved. Rank #${md.market_cap_rank || 'N/A'} with ${exchanges.length} exchange listings.`,
              searchedSources: ['Gate.io', 'CoinGecko', 'Native Token Database']
            };
          }
        } catch(cgErr) {
          console.log(`[MultiChain] Final CoinGecko fallback failed: ${cgErr.message}`);
        }

        // Final fallback: try Gate.io scrape directly for market data even without contract
        console.log(`[MultiChain] Trying Gate.io scrape fallback for ${symbol}...`);
        try {
          const gateInfoContracts = await gateioService.scrapeGateioInfoPage(symbol);
          if (gateInfoContracts.length > 0) {
            console.log(`[MultiChain] Gate.io info page found ${gateInfoContracts.length} contract(s) on retry`);
            contracts = gateInfoContracts;
          } else {
            const gateTradeContracts = await gateioService.scrapeGateioPage(symbol);
            if (gateTradeContracts.length > 0) {
              console.log(`[MultiChain] Gate.io trade page found ${gateTradeContracts.length} contract(s) on retry`);
              contracts = gateTradeContracts;
            }
          }
        } catch(scrapeErr) {
          console.log(`[MultiChain] Gate.io scrape fallback failed: ${scrapeErr.message}`);
        }

        if (contracts.length === 0) {
          return {
            success: false,
            error: `No contract addresses found for symbol: ${symbol}`,
            suggestion: 'Token may be a native blockchain token without a contract address, or not listed on supported platforms. Try using a contract address directly if this is an ERC-20/BEP-20 token.',
            symbol: symbol.toUpperCase(),
            searchedSources: ['Gate.io', 'CoinGecko', 'Native Token Database']
          };
        }
      }
      
      console.log(`Found ${contracts.length} contract(s) for ${symbol}`);

      // Run chains SEQUENTIALLY to avoid concurrent puppeteer sessions (causes 5min waits)
      const analyses = [];
      for (const contract of contracts) {
        console.log(`\n[MultiChain] Analyzing ${symbol} on ${contract.network}...`);
        const result = await Promise.allSettled([
          tokenAnalyzer.analyzeToken(contract.address, contract.network)
        ]);
        analyses.push(result[0]);
        // Small delay between chains to avoid rate limiting
        if (contracts.indexOf(contract) < contracts.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      const explorersList = contracts.map(c => c.explorer);
      
      const results = contracts.map((contract, index) => {
        const analysis = analyses[index];
        return {
          network: contract.network,
          contractAddress: contract.address,
          explorer: contract.explorer,
          analysis: analysis.status === 'fulfilled' ? analysis.value : null,
          error: analysis.status === 'rejected' ? analysis.reason.message : null
        };
      });

      const globalScore = this.calculateGlobalScore(results);
      const overallRisk = this.determineOverallRisk(results, globalScore);

      const explorersData = contracts.map(c => ({
        network: c.network,
        url: c.explorer
      }));

      const gapHunterRisk = this.calculateGlobalGapHunterRisk(results);
      
      const firstAnalysis = results.find(r => r.analysis && r.analysis.gapHunterBotRisk);
      const aiRiskScore = firstAnalysis?.analysis?.gapHunterBotRisk?.AIriskScore || null;
      
      console.log('\n=== Adding AI Risk to Global Response ===');
      console.log('AI Risk Score:', aiRiskScore);
      
      const finalResult = {
        success: true,
        symbol: symbol.toUpperCase(),
        chainsFound: contracts.length,
        globalSpamScore: globalScore.score,
        overallRisk: overallRisk,
        isSpamGlobally: globalScore.score >= 60,
        gapHunterBotRisk: {
          ...gapHunterRisk,
          AIriskScore: aiRiskScore
        },
        allExplorers: explorersData,
        chains: results,
        summary: this.generateSummary(results, globalScore)
      };
      
      // Save full details to MongoDB (optional - don't fail if it fails)
      try {
        const mongoService = require('./mongoService');
        await mongoService.saveFullTokenDetails(symbol.toUpperCase(), finalResult);
      } catch (mongoError) {
        console.log(`⚠️  MongoDB full details save failed (non-critical): ${mongoError.message}`);
      }
      
      // Save to cache (optional - don't fail if cache fails)
      try {
        const cacheService = require('./cacheService');
        const cacheKey = `${symbol.toUpperCase()}`;
        await cacheService.set(cacheKey, finalResult);
        console.log(`💾 Cached multi-chain analysis for ${symbol} under key: ${cacheKey}`);
      } catch (cacheError) {
        console.log(`⚠️  Cache save failed (non-critical): ${cacheError.message}`);
      }
      
      return finalResult;
    } catch (error) {
      // Check if error is MongoDB related - if so, don't fail the entire analysis
      if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('MongoDB'))) {
        console.log('⚠️  MongoDB not available - analysis completed but not saved to database');
        // If we have a partial result, return it
        if (results && results.length > 0) {
          const globalScore = this.calculateGlobalScore(results);
          const overallRisk = this.determineOverallRisk(results, globalScore);
          const explorersData = contracts.map(c => ({
            network: c.network,
            url: c.explorer
          }));
          const gapHunterRisk = this.calculateGlobalGapHunterRisk(results);
          const firstAnalysis = results.find(r => r.analysis && r.analysis.gapHunterBotRisk);
          const aiRiskScore = firstAnalysis?.analysis?.gapHunterBotRisk?.AIriskScore || null;
          
          return {
            success: true,
            symbol: symbol.toUpperCase(),
            chainsFound: contracts.length,
            globalSpamScore: globalScore.score,
            overallRisk: overallRisk,
            isSpamGlobally: globalScore.score >= 60,
            gapHunterBotRisk: {
              ...gapHunterRisk,
              AIriskScore: aiRiskScore
            },
            allExplorers: explorersData,
            chains: results,
            summary: this.generateSummary(results, globalScore),
            warning: 'Analysis completed but not saved to database (MongoDB unavailable)'
          };
        }
      }
      throw new Error(`Multi-chain analysis failed: ${error.message}`);
    }
  }

  calculateGlobalScore(results) {
    const validResults = results.filter(r => r.analysis && r.analysis.spamScore);
    
    if (validResults.length === 0) {
      return { score: 0, averageScore: 0, maxScore: 0, minScore: 0 };
    }

    const scores = validResults.map(r => r.analysis.spamScore);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const globalScore = Math.round((maxScore * 0.6) + (averageScore * 0.4));

    return {
      score: globalScore,
      averageScore: Math.round(averageScore),
      maxScore,
      minScore
    };
  }

  determineOverallRisk(results, globalScore) {
    const score = globalScore.score;
    const validResults = results.filter(r => r.analysis);
    
    if (validResults.length === 0) return 'UNKNOWN';

    const criticalCount = validResults.filter(r => r.analysis.riskLevel === 'CRITICAL').length;
    const highCount = validResults.filter(r => r.analysis.riskLevel === 'HIGH').length;
    
    if (criticalCount > 0 || score >= 80) return 'CRITICAL';
    if (highCount > validResults.length / 2 || score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  generateSummary(results, globalScore) {
    const validResults = results.filter(r => r.analysis);
    const spamChains = validResults.filter(r => r.analysis.isSpam).length;
    const totalChains = validResults.length;

    if (totalChains === 0) {
      return 'Unable to analyze token - no valid data retrieved.';
    }

    if (spamChains === 0) {
      return `Token appears legitimate across all ${totalChains} chain(s) analyzed with low risk indicators.`;
    }

    if (spamChains === totalChains) {
      return `WARNING: Token shows spam characteristics on ALL ${totalChains} chain(s) - high risk of scam.`;
    }

    return `Mixed risk profile: ${spamChains} of ${totalChains} chain(s) show spam indicators - proceed with caution.`;
  }

  calculateGlobalGapHunterRisk(results) {
    const validResults = results.filter(r => r.analysis && r.analysis.gapHunterBotRisk && !r.error);

    if (validResults.length === 0) {
      return {
        riskPercentage: 100,
        shouldSkip: true,
        hardSkip: true,
        hardSkipReasons: ['No valid analysis data available'],
        recommendation: '🛑 HARD SKIP - Insufficient data',
        chainsAnalyzed: 0
      };
    }

    // Use the chain with the HIGHEST risk as the representative (worst case)
    const representative = validResults.reduce((worst, r) => {
      const risk = r.analysis.gapHunterBotRisk?.riskPercentage || 0;
      const worstRisk = worst.analysis.gapHunterBotRisk?.riskPercentage || 0;
      return risk > worstRisk ? r : worst;
    }, validResults[0]);

    const repRisk = representative.analysis.gapHunterBotRisk;
    const repRiskPct = repRisk.riskPercentage;

    // Hard skip only if the representative chain triggers it
    const anyHardSkip = repRisk.hardSkip;
    const uniqueHardSkipReasons = repRisk.hardSkipReasons || [];

    const shouldSkip = repRiskPct >= 60 || anyHardSkip;

    let recommendation = '';
    if (anyHardSkip) {
      recommendation = '🛑 HARD SKIP - Do not trade';
    } else if (shouldSkip) {
      recommendation = '🚫 SKIP - High risk for gap bot';
    } else if (repRiskPct >= 40) {
      recommendation = '⚠️ CAUTION - Risky trade';
    } else {
      recommendation = '✅ ACCEPTABLE for gap bot';
    }

    return {
      riskPercentage: parseFloat(repRiskPct.toFixed(2)),
      shouldSkip: shouldSkip,
      hardSkip: anyHardSkip,
      hardSkipReasons: uniqueHardSkipReasons,
      recommendation: recommendation,
      components: repRisk.components || {},
      chainsAnalyzed: validResults.length,
      representativeChain: representative.network,
      perChainRisks: validResults.map(r => ({
        network: r.network,
        riskPercentage: r.analysis.gapHunterBotRisk.riskPercentage,
        hardSkip: r.analysis.gapHunterBotRisk.hardSkip,
        marketCap: r.analysis.marketData?.marketCapRaw || 0
      }))
    };
  }

  async analyzeMultipleChains(contractAddresses) {
    const analyses = await Promise.allSettled(
      contractAddresses.map(({ address, network }) => 
        tokenAnalyzer.analyzeToken(address, network)
      )
    );

    const results = contractAddresses.map((contract, index) => {
      const analysis = analyses[index];
      return {
        network: contract.network,
        contractAddress: contract.address,
        analysis: analysis.status === 'fulfilled' ? analysis.value : null,
        error: analysis.status === 'rejected' ? analysis.reason.message : null
      };
    });

    const globalScore = this.calculateGlobalScore(results);
    const overallRisk = this.determineOverallRisk(results, globalScore);

    return {
      success: true,
      chainsAnalyzed: contractAddresses.length,
      globalSpamScore: globalScore.score,
      overallRisk: overallRisk,
      isSpamGlobally: globalScore.score >= 60,
      chains: results,
      summary: this.generateSummary(results, globalScore)
    };
  }
}

module.exports = new MultiChainAnalyzer();