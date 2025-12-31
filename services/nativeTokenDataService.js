// services/nativeTokenDataService.js - Fetch native token data from multiple sources
const axios = require('axios');

class NativeTokenDataService {
  constructor() {
    this.coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';
    this.cmcBaseUrl = 'https://pro-api.coinmarketcap.com/v2';
  }

  async fetchFromMultipleSources(symbol, coingeckoId) {
    console.log(`\n=== Fetching data for ${symbol} from multiple sources ===`);
    
    const [coingeckoData, cmcData, gateData, exchangeListings] = await Promise.allSettled([
      this.fetchFromCoinGecko(coingeckoId),
      this.fetchFromCMC(symbol),
      this.fetchFromGateIO(symbol),
      this.fetchExchangeListings(symbol)
    ]);

    let marketData = {};
    let exchanges = [];

    if (coingeckoData.status === 'fulfilled' && coingeckoData.value) {
      console.log('✓ CoinGecko data retrieved');
      marketData = { ...marketData, ...coingeckoData.value };
      exchanges = coingeckoData.value.exchanges || [];
    }

    if (cmcData.status === 'fulfilled' && cmcData.value) {
      console.log('✓ CoinMarketCap data retrieved');
      marketData = this.mergeMarketData(marketData, cmcData.value);
      if (cmcData.value.exchanges) {
        exchanges = [...new Set([...exchanges, ...cmcData.value.exchanges])];
      }
    }

    if (gateData.status === 'fulfilled' && gateData.value) {
      console.log('✓ Gate.io data retrieved');
      marketData = this.mergeMarketData(marketData, gateData.value);
      if (gateData.value.exchanges) {
        exchanges = [...new Set([...exchanges, ...gateData.value.exchanges])];
      }
    }

    if (exchangeListings.status === 'fulfilled' && exchangeListings.value) {
      console.log(`✓ Found ${exchangeListings.value.length} exchange listings`);
      exchanges = [...new Set([...exchanges, ...exchangeListings.value])];
    }

    if (marketData.currentPrice && marketData.volume24hRaw && !marketData.marketCapRaw) {
      console.log('⚠ Missing market cap, attempting to estimate from circulating supply...');
      const estimatedData = await this.estimateMarketCap(symbol, marketData);
      if (estimatedData) {
        marketData = this.mergeMarketData(marketData, estimatedData);
      }
    }

    console.log('\n=== Final market data summary ===');
    console.log(`Price: ${marketData.currentPrice || 'N/A'}`);
    console.log(`Market Cap: ${marketData.marketCap || 'N/A'}`);
    console.log(`Volume 24h: ${marketData.volume24h || 'N/A'}`);
    console.log(`Exchanges: ${exchanges.length}`);

    return {
      ...marketData,
      exchanges: exchanges.slice(0, 50)
    };
  }

  async estimateMarketCap(symbol, marketData) {
    try {
      const cmcUrl = `https://coinmarketcap.com/currencies/${symbol.toLowerCase()}/`;
      const response = await axios.get(cmcUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });

      const html = response.data;
      const supplyMatch = html.match(/Circulating Supply[^\d]*(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      if (supplyMatch && marketData.currentPrice) {
        const supply = parseFloat(supplyMatch[1].replace(/,/g, ''));
        const price = parseFloat(marketData.currentPrice);
        const estimatedMcap = supply * price;
        
        console.log(`✓ Estimated market cap: ${estimatedMcap.toLocaleString()} (${supply.toLocaleString()} × ${price})`);
        
        return {
          marketCapRaw: estimatedMcap,
          marketCap: estimatedMcap.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
          circulatingSupply: supply
        };
      }
      
      return null;
    } catch (error) {
      console.log('Market cap estimation failed:', error.message);
      return null;
    }
  }

  async fetchFromCoinGecko(coingeckoId) {
    try {
      console.log(`Fetching from CoinGecko API for ${coingeckoId}...`);
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/${coingeckoId}`, {
        params: {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: true,
          developer_data: false,
          sparkline: false
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const data = this.parseCoinGeckoData(response.data);
      console.log(`CoinGecko API success for ${coingeckoId}`);
      return data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log('CoinGecko rate limit hit, waiting 2s...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.fetchFromCoinGecko(coingeckoId);
      }
      console.log(`CoinGecko API failed for ${coingeckoId}:`, error.message);
      return null;
    }
  }

  async fetchFromCoinGeckoMarkets(symbol) {
    try {
      const response = await axios.get(`${this.coingeckoBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          ids: symbol.toLowerCase(),
          order: 'market_cap_desc',
          per_page: 10,
          page: 1,
          sparkline: false
        },
        timeout: 15000
      });

      if (response.data && response.data.length > 0) {
        return this.parseMarketData(response.data[0]);
      }
      return null;
    } catch (error) {
      console.log(`CoinGecko markets search failed:`, error.message);
      return null;
    }
  }

  async fetchFromCMC(symbol) {
    try {
      if (!process.env.CMC_API_KEY) {
        console.log('CMC API key not configured, trying web scraping...');
        return await this.scrapeCMC(symbol);
      }

      const response = await axios.get(`${this.cmcBaseUrl}/cryptocurrency/quotes/latest`, {
        params: {
          symbol: symbol.toUpperCase()
        },
        headers: {
          'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY,
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      if (response.data && response.data.data) {
        const tokenData = response.data.data[symbol.toUpperCase()];
        if (tokenData && tokenData[0]) {
          return this.parseCMCData(tokenData[0]);
        }
      }
      return await this.scrapeCMC(symbol);
    } catch (error) {
      console.log(`CMC API fetch failed, trying scraping:`, error.message);
      return await this.scrapeCMC(symbol);
    }
  }

  async scrapeCMC(symbol) {
    try {
      const searchUrl = `https://coinmarketcap.com/currencies/${symbol.toLowerCase()}/`;
      console.log(`Scraping CMC: ${searchUrl}`);
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 20000
      });

      const html = response.data;
      
      const priceMatch = html.match(/"price":(\d+\.?\d*)/i) || html.match(/\$(\d+\.\d+)/);
      const marketCapMatch = html.match(/"marketCap":(\d+\.?\d*)/i) || html.match(/Market Cap[^\d]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i);
      const volumeMatch = html.match(/"volume24h":(\d+\.?\d*)/i) || html.match(/Volume \(24h\)[^\d]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i);
      const changeMatch = html.match(/"percentChange24h":(-?\d+\.?\d*)/i) || html.match(/([+-]?\d+\.\d+)%\s*\(1d\)/i);
      const rankMatch = html.match(/Rank #(\d+)/) || html.match(/"cmc_rank":(\d+)/);
      
      const circulatingMatch = html.match(/"circulatingSupply":(\d+\.?\d*)/i) || 
                              html.match(/Circulating[^\d]+(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                              html.match(/circulating[^:]*:(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      const totalSupplyMatch = html.match(/"totalSupply":(\d+\.?\d*)/i) || 
                              html.match(/Total Supply[^\d]+(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                              html.match(/total[^:]*:(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      const maxSupplyMatch = html.match(/"maxSupply":(\d+\.?\d*)/i) || 
                            html.match(/Max Supply[^\d]+(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                            html.match(/max[^:]*:(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      const athPriceMatch = html.match(/"ath":\{"price":(\d+\.?\d*)/i) || 
                           html.match(/All Time High[^\$]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                           html.match(/ATH[^\$]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      const athDateMatch = html.match(/"athDate":"([^"]+)"/i) || 
                          html.match(/All Time High[^>]*>(\w{3}\s+\d+,\s+\d{4})/i) ||
                          html.match(/ATH[^>]*>(\w{3}\s+\d+,\s+\d{4})/i);
      
      const atlPriceMatch = html.match(/"atl":\{"price":(\d+\.?\d*)/i) || 
                           html.match(/All Time Low[^\$]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i) ||
                           html.match(/ATL[^\$]*\$(\d+(?:,\d+)*(?:\.\d+)?)/i);
      
      const atlDateMatch = html.match(/"atlDate":"([^"]+)"/i) || 
                          html.match(/All Time Low[^>]*>(\w{3}\s+\d+,\s+\d{4})/i) ||
                          html.match(/ATL[^>]*>(\w{3}\s+\d+,\s+\d{4})/i);
      
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
      const marketCap = marketCapMatch ? parseFloat(marketCapMatch[1].replace(/,/g, '')) : null;
      const volume = volumeMatch ? parseFloat(volumeMatch[1].replace(/,/g, '')) : null;
      const change = changeMatch ? parseFloat(changeMatch[1]) : null;
      const rank = rankMatch ? parseInt(rankMatch[1]) : null;
      
      const circulatingSupply = circulatingMatch ? parseFloat(circulatingMatch[1].replace(/,/g, '')) : null;
      const totalSupply = totalSupplyMatch ? parseFloat(totalSupplyMatch[1].replace(/,/g, '')) : null;
      const maxSupply = maxSupplyMatch ? parseFloat(maxSupplyMatch[1].replace(/,/g, '')) : null;
      
      const athPrice = athPriceMatch ? parseFloat(athPriceMatch[1].replace(/,/g, '')) : null;
      const athDate = athDateMatch ? athDateMatch[1].trim() : null;
      
      const atlPrice = atlPriceMatch ? parseFloat(atlPriceMatch[1].replace(/,/g, '')) : null;
      const atlDate = atlDateMatch ? atlDateMatch[1].trim() : null;

      console.log('CMC scraping results:', { 
        price, marketCap, volume, change, rank,
        circulatingSupply, totalSupply, maxSupply,
        athPrice, athDate, atlPrice, atlDate
      });

      if (price || marketCap || volume) {
        return {
          currentPrice: price ? `${price}` : null,
          marketCapRaw: marketCap,
          marketCap: marketCap ? marketCap.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
          volume24hRaw: volume,
          volume24h: volume ? volume.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
          priceChange24h: change ? `${change.toFixed(2)}%` : null,
          marketCapRank: rank,
          circulatingSupply: circulatingSupply,
          totalSupply: totalSupply,
          maxSupply: maxSupply,
          ath: athPrice,
          athDate: athDate,
          atl: atlPrice,
          atlDate: atlDate,
          fullyDilutedValuation: (price && totalSupply) ? price * totalSupply : null
        };
      }
      
      return null;
    } catch (error) {
      console.log(`CMC scraping failed for ${symbol}:`, error.message);
      return null;
    }
  }

  async fetchFromGateIO(symbol) {
    try {
      const pairs = [`${symbol.toUpperCase()}_USDT`, `${symbol.toUpperCase()}_USD`];
      
      for (const pair of pairs) {
        try {
          const response = await axios.get(`https://api.gateio.ws/api/v4/spot/tickers`, {
            params: {
              currency_pair: pair
            },
            timeout: 15000
          });

          if (response.data && response.data.length > 0) {
            const ticker = response.data[0];
            const volume = parseFloat(ticker.quote_volume) || null;
            const price = parseFloat(ticker.last) || null;
            
            console.log(`Gate.io data for ${pair}:`, { price, volume });
            
            return {
              volume24hRaw: volume,
              volume24h: volume ? volume.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
              currentPrice: price ? `${price}` : null,
              priceChange24h: ticker.change_percentage ? `${ticker.change_percentage}%` : null,
              exchanges: ['Gate.io']
            };
          }
        } catch (pairError) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.log(`Gate.io fetch failed:`, error.message);
      return null;
    }
  }

  async fetchExchangeListings(symbol) {
    try {
      const cmcUrl = `https://coinmarketcap.com/currencies/${symbol.toLowerCase()}/`;
      const response = await axios.get(cmcUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 20000
      });

      const html = response.data;
      const exchanges = new Set();
      
      const patterns = [
        /<a[^>]*href="\/exchanges\/([^\/"]+)\/"[^>]*>([^<]+)<\/a>/gi,
        /"exchangeName":"([^"]+)"/gi,
        /<td[^>]*class="[^"]*exchange[^"]*"[^>]*>([^<]+)<\/td>/gi,
        /data-exchange="([^"]+)"/gi
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const exchangeName = match[2] || match[1];
          if (exchangeName && exchangeName.length > 1 && !exchangeName.includes('http')) {
            const cleaned = exchangeName.trim().replace(/\s+/g, ' ');
            if (cleaned.length > 2 && cleaned.length < 50) {
              exchanges.add(cleaned);
            }
          }
        }
      }
      
      const commonExchanges = ['Coinbase', 'Binance', 'Gate.io', 'Uniswap', 'KuCoin', 'Bybit', 'MEXC', 
                                'Bitget', 'HTX', 'Kraken', 'OKX', 'Bitfinex', 'Upbit', 'Bithumb'];
      
      for (const exchange of commonExchanges) {
        const regex = new RegExp(exchange, 'i');
        if (regex.test(html)) {
          exchanges.add(exchange);
        }
      }
      
      console.log(`Found ${exchanges.size} exchanges for ${symbol}:`, Array.from(exchanges).slice(0, 10));
      return Array.from(exchanges);
    } catch (error) {
      console.log(`Exchange listings fetch failed:`, error.message);
      return [];
    }
  }

  parseCoinGeckoData(data) {
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

    const result = {
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
      fullyDilutedValuation: marketData.fully_diluted_valuation?.usd || null,
      priceChange7d: marketData.price_change_percentage_7d ? `${marketData.price_change_percentage_7d.toFixed(2)}%` : null,
      priceChange30d: marketData.price_change_percentage_30d ? `${marketData.price_change_percentage_30d.toFixed(2)}%` : null,
      exchanges: exchanges
    };

    console.log('CoinGecko parsed data:', {
      hasMarketCap: !!result.marketCapRaw,
      hasVolume: !!result.volume24hRaw,
      hasSupply: !!result.circulatingSupply,
      hasATH: !!result.ath,
      exchangeCount: exchanges.length
    });

    return result;
  }

  parseMarketData(coin) {
    return {
      marketCap: coin.market_cap ? coin.market_cap.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
      marketCapRaw: coin.market_cap || null,
      volume24h: coin.total_volume ? coin.total_volume.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
      volume24hRaw: coin.total_volume || null,
      priceChange24h: coin.price_change_percentage_24h ? `${coin.price_change_percentage_24h.toFixed(2)}%` : null,
      currentPrice: coin.current_price ? `${coin.current_price}` : null,
      circulatingSupply: coin.circulating_supply || null,
      totalSupply: coin.total_supply || null,
      maxSupply: coin.max_supply || null,
      ath: coin.ath || null,
      athDate: coin.ath_date || null,
      atl: coin.atl || null,
      atlDate: coin.atl_date || null,
      marketCapRank: coin.market_cap_rank || null
    };
  }

  parseCMCData(data) {
    const quote = data.quote?.USD || {};
    
    return {
      marketCap: quote.market_cap ? quote.market_cap.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
      marketCapRaw: quote.market_cap || null,
      volume24h: quote.volume_24h ? quote.volume_24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : null,
      volume24hRaw: quote.volume_24h || null,
      priceChange24h: quote.percent_change_24h ? `${quote.percent_change_24h.toFixed(2)}%` : null,
      currentPrice: quote.price ? `${quote.price}` : null,
      circulatingSupply: data.circulating_supply || null,
      totalSupply: data.total_supply || null,
      maxSupply: data.max_supply || null,
      marketCapRank: data.cmc_rank || null
    };
  }

  mergeMarketData(existing, newData) {
    const merged = {
      marketCap: existing.marketCap || newData.marketCap || null,
      marketCapRaw: existing.marketCapRaw || newData.marketCapRaw || null,
      volume24h: existing.volume24h || newData.volume24h || null,
      volume24hRaw: existing.volume24hRaw || newData.volume24hRaw || null,
      priceChange24h: existing.priceChange24h || newData.priceChange24h || null,
      currentPrice: existing.currentPrice || newData.currentPrice || null,
      circulatingSupply: existing.circulatingSupply || newData.circulatingSupply || null,
      totalSupply: existing.totalSupply || newData.totalSupply || null,
      maxSupply: existing.maxSupply || newData.maxSupply || null,
      ath: existing.ath || newData.ath || null,
      athDate: existing.athDate || newData.athDate || null,
      atl: existing.atl || newData.atl || null,
      atlDate: existing.atlDate || newData.atlDate || null,
      marketCapRank: existing.marketCapRank || newData.marketCapRank || null,
      fullyDilutedValuation: existing.fullyDilutedValuation || newData.fullyDilutedValuation || null,
      exchanges: existing.exchanges || newData.exchanges || []
    };
    
    if (!merged.fullyDilutedValuation && merged.currentPrice && merged.totalSupply) {
      const price = parseFloat(merged.currentPrice);
      const supply = parseFloat(merged.totalSupply);
      if (!isNaN(price) && !isNaN(supply)) {
        merged.fullyDilutedValuation = price * supply;
      }
    }
    
    return merged;
  }
}

module.exports = new NativeTokenDataService();