// services/puppeteerScraper.js - Headless browser scraper for blockchain explorers
const puppeteer = require('puppeteer');

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
      const holderChartUrl = baseUrl.replace('/token/', '/token/tokenholderchart/');
      
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
          const results = [];
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
            
            const percentageText = cells[2].textContent.trim();
            const percentageMatch = percentageText.match(/([\d.]+)/);
            if (!percentageMatch) return;
            
            const percentage = parseFloat(percentageMatch[1]);
            
            if (address.toLowerCase() !== contractLower && percentage > 0 && percentage <= 100) {
              results.push({
                rank,
                address,
                balance: '0',
                percentage
              });
            }
          });
          
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
          
          const quantityText = cells[2].textContent.trim().replace(/,/g, '');
          const balance = quantityText;
          
          const percentageText = cells[3].textContent.trim();
          const percentageMatch = percentageText.match(/([\d.]+)/);
          if (!percentageMatch) return;
          
          const percentage = parseFloat(percentageMatch[1]);
          
          if (address.toLowerCase() !== contractLower && percentage > 0 && percentage <= 100) {
            results.push({
              rank,
              address,
              balance,
              percentage
            });
          }
        });
        
        return results;
      }, contractAddress);
      
      console.log(`✓ Extracted ${holders.length} holders from standard page in ${Date.now() - startTime}ms`);
      holders.forEach(h => console.log(`  Rank ${h.rank}: ${h.address} - ${h.percentage}%`));
      
      await page.close();
      return holders;
      
    } catch (error) {
      console.error('Puppeteer scraping error:', error.message);
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (closeError) {
          console.error('Error closing page:', closeError.message);
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