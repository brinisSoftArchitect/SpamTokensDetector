// services/puppeteerScraper.js - Headless browser scraper for blockchain explorers
const browserManager = require('./browserManager');
const fs = require('fs').promises;
const path = require('path');
const aiHtmlParser = require('./aiHtmlParser');

class PuppeteerScraper {
  constructor() {
    // No longer managing browser instance locally
  }

  getIframeUrl(address, explorerBaseUrl) {
    // s=0 means no minimum balance filter - show ALL holders from rank 1
    return `${explorerBaseUrl}/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`;
  }

  async extractHoldersFromPage(page, contractAddress, sourceLabel) {
    return await page.evaluate((contractAddr, label) => {
      const results = [];
      const seenAddresses = new Set();
      const contractLower = contractAddr.toLowerCase();

      // Try multiple table selectors
      const tableSelectors = [
        'table tbody tr',
        '#maintable tbody tr', 
        '#mainaddress tr',
        'tbody tr'
      ];

      let rows = [];
      for (const sel of tableSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          rows = found;
          console.log(`[${label}] Using selector: ${sel}, found ${found.length} rows`);
          break;
        }
      }

      if (rows.length === 0) {
        console.log(`[${label}] No table rows found. Page title: ${document.title}`);
        console.log(`[${label}] Body text preview: ${document.body?.innerText?.substring(0, 200)}`);
        return results;
      }

      rows.forEach((row, rowIdx) => {
        if (results.length >= 10) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;

        // Get rank - fallback to row index if not numeric
        const rankText = cells[0]?.textContent?.trim();
        let rank = parseInt(rankText);
        if (isNaN(rank)) rank = rowIdx + 1; // use actual row index for correct rank

        // Get address - try multiple methods
        let address = '';
        const addressCell = cells[1];

        // Method 1: data-highlight-target
        const highlightEl = addressCell.querySelector('[data-highlight-target]');
        if (highlightEl) {
          address = highlightEl.getAttribute('data-highlight-target').trim();
        }
        // Method 2: href of anchor
        if (!address || !address.startsWith('0x')) {
          const anchor = addressCell.querySelector('a[href*="/address/"]');
          if (anchor) {
            const href = anchor.getAttribute('href') || '';
            const match = href.match(/\/address\/(0x[a-fA-F0-9]{40})/);
            if (match) address = match[1];
          }
        }
        // Method 3: text content matching 0x pattern
        if (!address || !address.startsWith('0x')) {
          const text = addressCell.textContent || '';
          const match = text.match(/(0x[a-fA-F0-9]{40})/);
          if (match) address = match[1];
        }

        // Method 4: data-clipboard-text attribute (etherscan copy button)
        if (!address || !address.startsWith('0x')) {
          const clipEl = addressCell.querySelector('[data-clipboard-text]');
          if (clipEl) {
            const val = clipEl.getAttribute('data-clipboard-text').trim();
            if (val.startsWith('0x') && val.length === 42) address = val;
          }
        }

        // Method 5: href with ?a= param (iframe URL style)
        if (!address || !address.startsWith('0x')) {
          const anchor = addressCell.querySelector('a[href]');
          if (anchor) {
            const href = anchor.getAttribute('href') || '';
            const m = href.match(/[?&]a=(0x[a-fA-F0-9]{40})/);
            if (m) address = m[1];
          }
        }

        if (!address || !address.startsWith('0x')) return;
        const addressLower = address.toLowerCase();
        if (seenAddresses.has(addressLower) || addressLower === contractLower) return;

        // Get label - check tooltip, title, then link text (even if it's a name not 0x)
        let holderLabel = null;
        const titleEl = addressCell.querySelector('[data-bs-title],[title]');
        if (titleEl) {
          holderLabel = titleEl.getAttribute('data-bs-title') || titleEl.getAttribute('title');
        }
        if (!holderLabel) {
          const anchor = addressCell.querySelector('a');
          if (anchor) {
            const txt = anchor.textContent.trim();
            // Accept any non-empty label including named addresses like 'superformfoundation.e...'
            if (txt && txt.length < 80) holderLabel = txt;
          }
        }

        // Get balance (cell 2) and percentage (cell 3)
        const balance = cells[2]?.textContent?.trim().replace(/,/g, '').replace(/[^0-9.]/g, '') || '0';
        const pctText = cells[3]?.textContent?.trim().replace('%', '').trim() || '0';
        const percentage = parseFloat(pctText) || 0;

        console.log(`[${label}] Rank ${rank}: ${address.substring(0,10)}... label=${holderLabel} bal=${balance} pct=${percentage}%`);

        // Accept if address valid and any of: balance > 0, percentage > 0, or rank <= 5 (top holders may show formatted numbers)
        if (address && address.startsWith('0x') && (parseFloat(balance) > 0 || percentage > 0 || rank <= 5)) {
          seenAddresses.add(addressLower);
          results.push({ rank, address, label: holderLabel, balance, percentage });
        }
      });

      console.log(`[${label}] Total extracted: ${results.length}`);
      return results;
    }, contractAddress, sourceLabel);
  }

  async scrapeTokenHolders(url, contractAddress) {
    let page = null;
    const startTime = Date.now();

    // Determine explorer base URL from the token URL
    const urlObj = new URL(url);
    const explorerBase = `${urlObj.protocol}//${urlObj.hostname}`;
    const iframeUrl = this.getIframeUrl(contractAddress, explorerBase);

    console.log(`[PuppeteerScraper] explorerBase: ${explorerBase}`);
    console.log(`[PuppeteerScraper] iframeUrl: ${iframeUrl}`);
    
    try {
      page = await browserManager.getPage();

      // Strategy 1: Load the iframe/generic holders URL directly
      console.log(`[PuppeteerScraper] Strategy 1: Loading iframe URL...`);
      try {
        const resp = await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 25000 });
        console.log(`[PuppeteerScraper] iframe status: ${resp?.status()}, time: ${Date.now()-startTime}ms`);
        await page.waitForTimeout(4000);

        // Save debug HTML
        const html1 = await page.content();
        require('fs').writeFileSync(`/tmp/debug_iframe_${contractAddress.substring(0,10)}.html`, html1);
        console.log(`[PuppeteerScraper] iframe HTML length: ${html1.length}, has table: ${html1.includes('<table')}, title: ${html1.match(/<title>(.*?)<\/title>/)?.[1]}`);

        const holders1 = await this.extractHoldersFromPage(page, contractAddress, 'IFRAME');
        if (holders1.length > 0) {
          console.log(`✅ [PuppeteerScraper] Strategy 1 SUCCESS: ${holders1.length} holders`);
          await page.close();
          return holders1;
        }
        console.log(`[PuppeteerScraper] Strategy 1 got 0 holders`);
      } catch (e) {
        console.log(`[PuppeteerScraper] Strategy 1 failed: ${e.message}`);
      }

      // Strategy 2: Load main token page and wait for iframe to populate
      console.log(`[PuppeteerScraper] Strategy 2: Loading main token page...`);
      try {
        const tokenPageUrl = `${explorerBase}/token/${contractAddress}`;
        const resp2 = await page.goto(tokenPageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        console.log(`[PuppeteerScraper] main page status: ${resp2?.status()}, time: ${Date.now()-startTime}ms`);
        await page.waitForTimeout(5000);

        // Try to find and switch to the holders iframe
        const frames = page.frames();
        console.log(`[PuppeteerScraper] Found ${frames.length} frames on page`);
        
        for (const frame of frames) {
          const frameUrl = frame.url();
          console.log(`[PuppeteerScraper] Frame URL: ${frameUrl}`);
          if (frameUrl.includes('generic-tokenholders2') || frameUrl.includes('tokenholders')) {
            console.log(`[PuppeteerScraper] Found holders iframe! Extracting...`);
            await frame.waitForSelector('table', { timeout: 8000 }).catch(() => {});
            const frameHolders = await frame.evaluate((contractAddr) => {
              const results = [];
              const rows = document.querySelectorAll('table tbody tr, tbody tr');
              rows.forEach((row, idx) => {
                if (idx >= 10) return;
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                const rank = parseInt(cells[0]?.textContent?.trim());
                if (isNaN(rank)) return;
                const addrCell = cells[1];
                let addr = '';
                const a = addrCell.querySelector('a');
                if (a) {
                  const href = a.getAttribute('href') || '';
                  const m = href.match(/\/address\/(0x[a-fA-F0-9]{40})/);
                  if (m) addr = m[1];
                  if (!addr) { const t = a.textContent.trim(); if (t.startsWith('0x')) addr = t; }
                }
                if (!addr || !addr.startsWith('0x')) return;
                const balance = cells[2]?.textContent?.trim().replace(/,/g,'') || '0';
                const pct = parseFloat(cells[3]?.textContent?.replace('%','').trim()) || 0;
                if (parseFloat(balance) > 0) results.push({ rank, address: addr, label: null, balance, percentage: pct });
              });
              return results;
            }, contractAddress);
            if (frameHolders.length > 0) {
              console.log(`✅ [PuppeteerScraper] Strategy 2 iframe SUCCESS: ${frameHolders.length} holders`);
              await page.close();
              return frameHolders;
            }
          }
        }

        // Try extracting from main page anyway
        const holders2 = await this.extractHoldersFromPage(page, contractAddress, 'MAIN_PAGE');
        if (holders2.length > 0) {
          console.log(`✅ [PuppeteerScraper] Strategy 2 main page SUCCESS: ${holders2.length} holders`);
          await page.close();
          return holders2;
        }
      } catch (e) {
        console.log(`[PuppeteerScraper] Strategy 2 failed: ${e.message}`);
      }

      console.log(`[PuppeteerScraper] All strategies failed, returning []`);
      await page.close();
      return [];
      
    } catch (error) {
      console.error('[PuppeteerScraper] Fatal error:', error.message);
      if (page && !page.isClosed()) await page.close();
      return [];
    }
  }

  async close() {
    // Browser lifecycle is now managed by browserManager
    // This method kept for backward compatibility
    console.log('Note: Browser is managed centrally, use browserManager.close() to force close');
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
      // Removed duplicate AI parsing call that was causing issues

    let page;
    try {
      page = await browserManager.getPage();

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

      await page.close();

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
        // await fs.writeFile(htmlFilePath, '<!-- HTML content will be captured on retry -->', 'utf8');
        console.log(`💾 you can save HTML cache path prepared: ${htmlFilePath}`);
      } catch (saveError) {
        console.log('⚠️ Could not prepare HTML cache:', saveError.message);
      }

      return null;
    } finally {
      if (page && !page.isClosed()) {
        try {
          await page.close();
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

    let page;
    try {
      page = await browserManager.getPage();

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
      // await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
      console.log(`💾 you can save HTML saved to: ${htmlFilePath}`);

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
      if (page && !page.isClosed()) {
        await page.close();
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

  getIframeUrlByNetwork(address, network) {
    const baseUrls = {
      'ethereum': `https://etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'bsc': `https://bscscan.com/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'polygon': `https://polygonscan.com/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'arbitrum': `https://arbiscan.io/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'optimism': `https://optimistic.etherscan.io/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'avalanche': `https://snowtrace.io/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'fantom': `https://ftmscan.com/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`,
      'base': `https://basescan.org/token/generic-tokenholders2?m=light&a=${address}&s=0&sid=&p=1`
    };
    return baseUrls[network.toLowerCase()] || baseUrls['ethereum'];
  }
}

module.exports = new PuppeteerScraper();