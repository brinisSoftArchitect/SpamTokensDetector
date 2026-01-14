// services/htmlFetcher.js - Reusable HTML fetcher using Puppeteer
const puppeteer = require('puppeteer');

class HtmlFetcher {
  constructor() {
    this.browser = null;
    this.browserInitialized = false;
  }

  async initialize() {
    if (!this.browser || !this.browserInitialized) {
      try {
        console.log('🌐 Initializing browser for HTML fetching...');
        
        // Detect if running on macOS and use appropriate config
        const isMac = process.platform === 'darwin';
        const launchOptions = {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080'
          ]
        };
        
        // On macOS, try to use system Chrome if available
        if (isMac) {
          const chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
          ];
          
          const fs = require('fs');
          for (const chromePath of chromePaths) {
            if (fs.existsSync(chromePath)) {
              console.log(`✅ Found Chrome at: ${chromePath}`);
              launchOptions.executablePath = chromePath;
              break;
            }
          }
        }
        
        this.browser = await puppeteer.launch(launchOptions);
        this.browserInitialized = true;
        console.log('✅ Browser initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize browser:', error.message);
        throw error;
      }
    }
    return this.browser;
  }

  async fetchHtml(url, options = {}) {
    const {
      waitForSelector = null,
      waitTime = 3000,
      timeout = 30000,
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    } = options;

    let page = null;
    try {
      await this.initialize();
      page = await this.browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(userAgent);
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Block unnecessary resources to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      console.log(`🌐 Navigating to: ${url}`);
      
      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: timeout
      });
      
      const status = response ? response.status() : 0;
      console.log(`✅ Page loaded with status: ${status}`);
      
      if (!response) {
        throw new Error('No response received from server');
      }
      
      if (response.status() === 403) {
        throw new Error(`HTTP 403: Access denied - Explorer is blocking requests. Try using VPN or different IP.`);
      }
      
      if (response.status() === 404) {
        throw new Error(`HTTP 404: Page not found`);
      }
      
      if (response.status() >= 400) {
        throw new Error(`HTTP ${response.status()}: Request failed`);
      }
      
      // Wait for specific selector if provided
      if (waitForSelector) {
        console.log(`⏳ Waiting for selector: ${waitForSelector}`);
        await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
          console.log(`⚠️ Selector not found, continuing anyway...`);
        });
      }
      
      // Additional wait time for dynamic content
      if (waitTime > 0) {
        console.log(`⏳ Waiting ${waitTime}ms for dynamic content...`);
        await page.waitForTimeout(waitTime);
      }
      
      // Get the full HTML content
      const html = await page.content();
      console.log(`✅ HTML fetched successfully, length: ${html.length} bytes`);
      
      await page.close();
      return {
        success: true,
        html: html,
        url: url
      };
      
    } catch (error) {
      console.error(`❌ Failed to fetch HTML from ${url}:`, error.message);
      if (page && !page.isClosed()) {
        await page.close();
      }
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  }

  async close() {
    if (this.browser) {
      try {
        console.log('🔒 Closing browser...');
        await this.browser.close();
        this.browser = null;
        this.browserInitialized = false;
        console.log('✅ Browser closed');
      } catch (error) {
        console.error('❌ Error closing browser:', error.message);
      }
    }
  }

  async fetchMultipleUrls(urls, options = {}) {
    const results = [];
    
    for (const url of urls) {
      const result = await this.fetchHtml(url, options);
      results.push(result);
      
      // Small delay between requests to avoid rate limiting
      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
}

module.exports = new HtmlFetcher();