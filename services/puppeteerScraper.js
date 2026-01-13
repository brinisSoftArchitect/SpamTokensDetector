// services/puppeteerScraper.js - Headless browser scraper for blockchain explorers
const puppeteer = require('puppeteer');
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
        this.browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
          ]
        });
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
      await page.goto(standardUrl, { 
        waitUntil: 'load',
        timeout: 15000 
      });
      
      console.log(`Standard page loaded in ${Date.now() - startTime}ms`);
      
      await page.waitForSelector('#maintable', { timeout: 8000 });
      await page.waitForTimeout(1500);
      
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
}

module.exports = new PuppeteerScraper();