// services/puppeteerScraper.js - Headless browser scraper for blockchain explorers
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const aiHtmlParser = require('./aiHtmlParser');

class PuppeteerScraper {
  constructor() {
    this.browser = null;
    this.isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    this.browserInitialized = false;
  }

  async initialize() {
    if (!this.browser || !this.browserInitialized) {
      try {
        const isMac = process.platform === 'darwin';
        const launchOptions = {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
          ]
        };
        
        // On macOS, try to use system Chrome
        if (isMac) {
          const fs = require('fs');
          const chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
          ];
          
          for (const chromePath of chromePaths) {
            if (fs.existsSync(chromePath)) {
              launchOptions.executablePath = chromePath;
              break;
            }
          }
        }
        
        this.browser = await puppeteer.launch(launchOptions);
        this.browserInitialized = true;
      } catch (error) {
        console.error('Failed to initialize Puppeteer:', error.message);
        throw error;
      }
    }
    return this.browser;
  }

  async scrapeTokenHolders(url, contractAddress) {
    let page = null;
    const startTime = Date.now();
    
    try {
      await this.initialize();
      page = await this.browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const baseUrl = url.replace('#balances', '');
      let holderChartUrl = baseUrl.replace('/token/', '/token/tokenholderchart/');
      
      // For some explorers, use different holder chart paths
      if (url.includes('cronoscan.com') || url.includes('moonscan.io') || 
          url.includes('gnosisscan.io') || url.includes('celoscan.io') ||
          url.includes('lineascan.build') || url.includes('scrollscan.com')) {
        holderChartUrl = baseUrl.replace('/token/', '/token/tokenholderchart/');
      }
      
      console.log(`Attempting holder chart: ${holderChartUrl}`);
      
      try {
        const response = await page.goto(holderChartUrl, { 
          waitUntil: 'load',
          timeout: 15000 
        });
        
        console.log(`Page loaded in ${Date.now() - startTime}ms`);
        
        if (response && response.status() === 404) {
          throw new Error('Holder chart page not found');
        }
        
        await page.waitForTimeout(2000);
        
        const holders = await page.evaluate((contractAddr) => {
          console.log('[HOLDER CHART EXTRACTION] Starting extraction...');
          console.log('=== OWNERSHIP ANALYSIS PROCESS ===');
          console.log('Step 1: Check if holders data exists');
          const results = [];
          const seenAddresses = new Set();
          const contractLower = contractAddr.toLowerCase();
          
          const table = document.querySelector('#mainaddress');
          if (!table) return results;
          
          const rows = table.querySelectorAll('tr');
          
          rows.forEach((row) => {
            if (results.length >= 10) return;
            
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            
            const rankText = cells[0].textContent.trim();
            const rank = parseInt(rankText);
            if (isNaN(rank)) return;
            
            const addressElement = cells[1].querySelector('a');
            if (!addressElement) return;
            
            const address = addressElement.textContent.trim();
            const addressLower = address.toLowerCase();
            
            // Skip if we've already seen this address or if it's the contract itself
            if (seenAddresses.has(addressLower) || addressLower === contractLower) {
              console.log(`[HOLDER CHART] Skipping duplicate/contract: ${address}`);
              return;
            }
            
            // Extract label from the address cell
            let label = null;
            const addressCell = cells[1];
            
            // Try to find label text before the address link
            const cellText = addressCell.textContent.trim();
            const addressText = addressElement.textContent.trim();
            
            // Extract text before the address
            const labelMatch = cellText.split(addressText)[0].trim();
            if (labelMatch && labelMatch.length > 0 && !labelMatch.match(/^[0-9]+$/)) {
              label = labelMatch.replace(/:\s*$/, '').trim();
            }
            
            // Also check for title or data-bs-title attributes
            if (!label) {
              const titleElement = addressCell.querySelector('[data-bs-title], [title]');
              if (titleElement) {
                label = titleElement.getAttribute('data-bs-title') || titleElement.getAttribute('title');
              }
            }
            
            // Percentage is in cells[3] - standard holders page
            // Table structure: Rank | Address | Quantity | Percentage | Value | Analytics
            if (cells.length < 4) {
              console.log(`[HOLDER CHART] Row ${rank}: Not enough cells (${cells.length})`);
              return;
            }
            
            // Extract quantity from cells[2]
            const quantityText = cells[2].textContent.trim().replace(/,/g, '');
            const balance = quantityText;
            
            console.log(`[HOLDER CHART] Rank ${rank}: ${label ? label + ' - ' : ''}${address.substring(0, 10)}..., Balance = ${balance}`);
            
            const quantity = parseFloat(balance) || 0;
            if (quantity > 0) {
              seenAddresses.add(addressLower);
              results.push({
                rank,
                address,
                label: label || null,
                balance,
                percentage: 0
              });
            }
          });
          
          console.log(`[HOLDER CHART] Total unique holders extracted: ${results.length}`);
          
          if (results.length > 0) {
            console.log('\nStep 2: Extract top holder information');
            console.log('Top Holder Data:');
            console.log(`  Address: ${results[0].address.substring(0, 42)}`);
            console.log(`  Label: ${results[0].label || 'Unknown'}`);
            console.log(`  Balance: ${results[0].balance}`);
            
            console.log('\n--- Label Extraction Verification (Top 5) ---');
            results.slice(0, 5).forEach(h => {
              console.log(`  Rank ${h.rank}: ${h.label || 'Unknown'} (${h.address.substring(0, 12)}...)`);
            });
            
            console.log('\n=== OWNERSHIP ANALYSIS COMPLETE ===');
          }
          
          return results;
        }, contractAddress);
        
        if (holders.length > 0) {
          console.log(`✓ Extracted ${holders.length} holders from chart in ${Date.now() - startTime}ms`);
          holders.forEach(h => console.log(`  Rank ${h.rank}: ${h.address} - ${h.percentage}%`));
          await page.close();
          return holders;
        }
      } catch (chartError) {
        console.log(`Holder chart failed after ${Date.now() - startTime}ms: ${chartError.message}`);
      }
      
      console.log('Trying standard holders page...');
      const standardUrl = `${baseUrl}#balances`;
      const standardResponse = await page.goto(standardUrl, { 
        waitUntil: 'networkidle2',
        timeout: 20000 
      });
      
      console.log(`Standard page loaded in ${Date.now() - startTime}ms`);
      console.log(`✅ Page loaded with status: ${standardResponse.status()}`);
      
      if (standardResponse.status() === 403) {
        throw new Error('Access denied (403) - explorer blocking requests');
      }
      
      // Wait for table to appear
      try {
        await page.waitForSelector('#maintable', { timeout: 8000 });
        console.log('✅ Found #maintable');
      } catch (e) {
        console.log('⚠️ #maintable not found, trying tbody...');
        await page.waitForSelector('tbody', { timeout: 8000 });
      }
      
      await page.waitForTimeout(2000);
      
      // Debug: Save page HTML
      const html = await page.content();
      const fs = require('fs');
      fs.writeFileSync(`debug_puppeteer_${contractAddress.substring(0, 10)}.html`, html);
      console.log(`💾 Saved Puppeteer HTML for debugging`);
      
      // Show HTML preview
      console.log('\n📄 HTML PREVIEW (first 1000 chars):');
      console.log(html.substring(0, 1000));
      console.log('...\n');
      
      const holders = await page.evaluate((contractAddr) => {
        const rows = document.querySelectorAll('#maintable tbody tr');
        const results = [];
        const seenAddresses = new Set();
        const contractLower = contractAddr.toLowerCase();
        
        rows.forEach((row) => {
          if (results.length >= 10) return;
          
          const cells = row.querySelectorAll('td');
          if (cells.length < 4) return;
          
          const rankText = cells[0].textContent.trim();
          const rank = parseInt(rankText);
          if (isNaN(rank)) return;
          
          const addressElement = cells[1].querySelector('[data-highlight-target]');
          if (!addressElement) return;
          
          const address = addressElement.getAttribute('data-highlight-target').trim();
          const addressLower = address.toLowerCase();
          
          // Skip if we've already seen this address or if it's the contract itself
          if (seenAddresses.has(addressLower) || addressLower === contractLower) {
            console.log(`[STANDARD PAGE] Skipping duplicate/contract: ${address}`);
            return;
          }
          
          // Extract label from the address cell
          let label = null;
          const addressCell = cells[1];
          
          // Try to find label text before the address link
          const addressLink = addressCell.querySelector('a[href*="/address/"]');
          if (addressLink) {
            const cellText = addressCell.textContent.trim();
            const addressText = addressLink.textContent.trim();
            
            // Extract text before the address
            const labelMatch = cellText.split(addressText)[0].trim();
            if (labelMatch && labelMatch.length > 0 && !labelMatch.match(/^[0-9]+$/)) {
              label = labelMatch.replace(/:\s*$/, '').trim();
            }
          }
          
          // Also check for title or data-bs-title attributes
          if (!label) {
            const titleElement = addressCell.querySelector('[data-bs-title], [title]');
            if (titleElement) {
              label = titleElement.getAttribute('data-bs-title') || titleElement.getAttribute('title');
            }
          }
          
          const quantityText = cells[2].textContent.trim().replace(/,/g, '');
          const balance = quantityText;
          
          console.log(`[STANDARD PAGE] Rank ${rank}: ${label ? label + ' - ' : ''}${address.substring(0, 10)}..., Balance = ${balance}`);
          
          if (balance !== '0') {
            seenAddresses.add(addressLower);
            results.push({
              rank,
              address,
              label: label || null,
              balance,
              percentage: 0
            });
          }
        });
        
        console.log(`[STANDARD PAGE] Total unique holders extracted: ${results.length}`);
        
        if (results.length > 0) {
          console.log('\n=== OWNERSHIP ANALYSIS PROCESS ===');
          console.log('Step 1: Check if holders data exists');
          console.log(`Holders array length: ${results.length}`);
          
          console.log('\nStep 2: Extract top holder information');
          console.log('Top Holder Data:');
          console.log(`  Address: ${results[0].address.substring(0, 42)}`);
          console.log(`  Label: ${results[0].label || 'Unknown'}`);
          console.log(`  Balance: ${results[0].balance}`);
          
          console.log('\n--- Label Extraction Verification (Top 5) ---');
          results.slice(0, 5).forEach(h => {
            console.log(`  Rank ${h.rank}: ${h.label || 'Unknown'} (${h.address.substring(0, 12)}...)`);
          });
          
          console.log('\n=== OWNERSHIP ANALYSIS COMPLETE ===');
        }
        
        return results;
      }, contractAddress);
      
      console.log(`✓ Extracted ${holders.length} holders from standard page in ${Date.now() - startTime}ms`);
      holders.forEach(h => console.log(`  Rank ${h.rank}: ${h.address} - ${h.percentage}%`));
      
      await page.close();
      return holders;
      
    } catch (error) {
      console.error('Puppeteer scraping error:', error.message);
      
      // Try AI parsing as fallback
      if (page && !page.isClosed()) {
        try {
          console.log('🤖 Attempting AI fallback parsing...');
          const html = await page.content();
          const aiResult = await aiHtmlParser.parseTokenPage(url, html, 'unknown', contractAddress);
          
          await page.close();
          
          if (aiResult.success && aiResult.holders && aiResult.holders.length > 0) {
            console.log(`✅ AI fallback extracted ${aiResult.holders.length} holders`);
            return aiResult.holders;
          }
        } catch (aiError) {
          console.error('AI fallback also failed:', aiError.message);
          await page.close();
        }
      }
      
      return [];
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('Error closing browser:', error.message);
      }
      this.browser = null;
      this.browserInitialized = false;
    }
  }

  async fetchHolderData(address, network = 'ethereum', useAiFallback = false) {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║ FETCHING HOLDER DATA FROM BLOCKCHAIN EXPLORER');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ Contract: ${address}`);
    console.log(`║ Network: ${network.toUpperCase()}`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (useAiFallback) {
      return await this.fetchWithAiFallback(address, network);
    }

    const iframeUrl = this.getIframeUrl(address, network);
    console.log(`📍 SOURCE URL FOR HOLDERS DATA:\n   ${iframeUrl}`);
    console.log('🔄 Attempting to fetch holder data...');
      const AIresult=await aiHtmlParser.parseTokenPageFromUrl(iframeUrl, network, symbol);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      await page.goto(iframeUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      await page.waitForTimeout(3000);

      const holderData = await page.evaluate(() => {
        const holders = [];
        const rows = document.querySelectorAll('table tbody tr');
        
        rows.forEach((row, idx) => {
          if (idx >= 15) return;
          
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;
          
          const rank = idx + 1;
          const addressCell = cells[1];
          const address = addressCell.querySelector('a')?.textContent?.trim() || '';
          
          if (!address || !address.startsWith('0x')) return;
          
          const balanceText = cells[2]?.textContent?.trim().replace(/,/g, '') || '0';
          const percentageText = cells[3]?.textContent?.trim().replace('%', '') || '0';
          
          const labelElement = addressCell.querySelector('[data-bs-title], [title]');
          const label = labelElement?.getAttribute('data-bs-title') || 
                       labelElement?.getAttribute('title') || 
                       null;
          
          const isExchange = label && (
            label.toLowerCase().includes('binance') ||
            label.toLowerCase().includes('gate') ||
            label.toLowerCase().includes('mexc') ||
            label.toLowerCase().includes('uniswap') ||
            label.toLowerCase().includes('exchange')
          );
          
          holders.push({
            rank,
            address,
            balance: balanceText,
            percentage: parseFloat(percentageText) || 0,
            label: label,
            isExchange: isExchange || false,
            isBlackhole: false,
            isContract: false,
            type: isExchange ? 'Exchange' : 'Regular'
          });
        });
        
        return { holders, totalHolders: holders.length };
      });

      await browser.close();

      if (holderData && holderData.holders && holderData.holders.length > 0) {
        console.log(`📊 Extracted ${holderData.holders.length} holders from iframe`);
        console.log(`✅ Top holder: ${holderData.holders[0].address} - Balance: ${holderData.holders[0].balance}`);
        return holderData;
      }

      console.log('⚠️ No holder data found in iframe');
      return null;

    } catch (error) {
      console.log(`❌ IFRAME FETCH FAILED: ${error.message}`);
      console.log('🤖 Attempting AI-based HTML parsing fallback...');
      
      try {
        const htmlCachePath = path.join(__dirname, '../cache/tokens/dist/html');
        await fs.mkdir(htmlCachePath, { recursive: true });
        const htmlFilePath = path.join(htmlCachePath, `${address.toLowerCase()}-${network.toLowerCase()}-holders.html`);
        await fs.writeFile(htmlFilePath, '<!-- HTML content will be captured on retry -->', 'utf8');
        console.log(`💾 HTML cache path prepared: ${htmlFilePath}`);
      } catch (saveError) {
        console.log('⚠️ Could not prepare HTML cache:', saveError.message);
      }

      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }
    }
  }

  async fetchWithAiFallback(address, network) {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║ AI-POWERED HTML PARSING FALLBACK');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ Contract: ${address}`);
    console.log(`║ Network: ${network.toUpperCase()}`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      const iframeUrl = this.getIframeUrl(address, network);
      console.log(`📍 Fetching URL: ${iframeUrl}`);
      
      await page.goto(iframeUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      await page.waitForTimeout(3000);

      // Get the full HTML content
      const htmlContent = await page.content();
      
      // Save HTML for AI processing
      const htmlCachePath = path.join(__dirname, '../cache/tokens/dist/html');
      await fs.mkdir(htmlCachePath, { recursive: true });
      const htmlFilePath = path.join(htmlCachePath, `${address.toLowerCase()}-${network.toLowerCase()}-holders.html`);
      await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
      console.log(`💾 HTML saved to: ${htmlFilePath}`);

      // Use AI to parse the HTML
      const aiHtmlParser = require('./aiHtmlParser');
      console.log('🤖 Sending HTML to AI parser...');
      const holderData = await aiHtmlParser.parseHolderHtml(htmlContent, address, network);

      if (holderData && holderData.holders && holderData.holders.length > 0) {
        console.log(`✅ AI successfully extracted ${holderData.holders.length} holders`);
        return holderData;
      } else {
        console.log('⚠️ AI parsing returned no holder data');
        return null;
      }

    } catch (error) {
      console.log('❌ AI FALLBACK FAILED:', error.message);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  getBaseUrl(address, network) {
    const baseUrls = {
      'ethereum': `https://etherscan.io/token/${address}`,
      'bsc': `https://bscscan.com/token/${address}`,
      'polygon': `https://polygonscan.com/token/${address}`,
      'arbitrum': `https://arbiscan.io/token/${address}`,
      'optimism': `https://optimistic.etherscan.io/token/${address}`,
      'avalanche': `https://snowtrace.io/token/${address}`,
      'fantom': `https://ftmscan.com/token/${address}`
    };
    return baseUrls[network.toLowerCase()] || baseUrls['ethereum'];
  }

  getIframeUrl(address, network) {
    const baseUrls = {
      'ethereum': `https://etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'bsc': `https://bscscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'polygon': `https://polygonscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'arbitrum': `https://arbiscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'optimism': `https://optimistic.etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'avalanche': `https://snowtrace.io/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`,
      'fantom': `https://ftmscan.com/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`
    };

    return baseUrls[network.toLowerCase()] || baseUrls['ethereum'];
  }
}

module.exports = new PuppeteerScraper();