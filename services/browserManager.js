// services/browserManager.js - Centralized browser instance manager
const puppeteer = require('puppeteer');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.lastUsedTime = null;
    this.maxIdleTime = 5 * 60 * 1000; // 5 minutes
    this.checkInterval = null;
    this.pageCount = 0; // Track active pages
  }

  async initialize() {
    // If already initialized and alive, return existing browser
    if (this.browser && this.browser.isConnected()) {
      console.log('\x1b[32m♻️  [BrowserManager] ✓ REUSING EXISTING BROWSER ✓\x1b[0m');
      this.lastUsedTime = Date.now();
      return this.browser;
    }

    // If currently initializing, wait for that to complete
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    // Start new initialization
    this.isInitializing = true;
    this.initPromise = this._launchBrowser();

    try {
      this.browser = await this.initPromise;
      this.lastUsedTime = Date.now();
      this.startIdleCheck();
      return this.browser;
    } catch (error) {
      console.error('Failed to initialize browser:', error.message);
      throw error;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  async _launchBrowser() {
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

    console.log('\x1b[31m🚀 [BrowserManager] ⚠️  LAUNCHING NEW CHROME INSTANCE ⚠️\x1b[0m');
    console.log('\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    const browser = await puppeteer.launch(launchOptions);
    console.log('\x1b[31m✅ [BrowserManager] New browser instance started\x1b[0m');
    console.log('\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    
    browser.on('disconnected', () => {
      console.log('⚠️ Browser disconnected');
      this.browser = null;
      this.stopIdleCheck();
    });

    return browser;
  }

  async getPage() {
    const browser = await this.initialize();
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    
    this.pageCount++;
    this.lastUsedTime = Date.now();
    console.log(`\x1b[32m📄 [BrowserManager] Created new page (total active: ${this.pageCount})\x1b[0m`);
    
    // Auto-close page when done to prevent memory leaks
    const originalClose = page.close.bind(page);
    page.close = async () => {
      this.pageCount--;
      this.lastUsedTime = Date.now();
      console.log(`\x1b[32m🗑️  [BrowserManager] Closed page (remaining active: ${this.pageCount})\x1b[0m`);
      return originalClose();
    };
    
    return page;
  }

  startIdleCheck() {
    if (this.checkInterval) return;
    
    this.checkInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastUsedTime;
      
      // Only close if idle AND no active pages
      if (idleTime > this.maxIdleTime && this.browser && this.pageCount === 0) {
        console.log(`🧹 Closing idle browser instance (idle for ${Math.floor(idleTime/1000)}s, 0 active pages)...`);
        this.close();
      } else if (this.pageCount > 0) {
        console.log(`⏳ Browser active with ${this.pageCount} open page(s)`);
      }
    }, 60000); // Check every minute
  }

  stopIdleCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async close() {
    this.stopIdleCheck();
    
    if (this.browser) {
      try {
        const pages = await this.browser.pages();
        console.log(`\x1b[33m🔒 [BrowserManager] Closing browser with ${pages.length} page(s) open...\x1b[0m`);
        
        // Close all pages first
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Page might already be closed
          }
        }
        
        await this.browser.close();
        console.log('\x1b[33m✓ [BrowserManager] Browser instance closed\x1b[0m');
      } catch (error) {
        console.error('\x1b[31m❌ [BrowserManager] Error closing browser:\x1b[0m', error.message);
      }
      this.browser = null;
      this.pageCount = 0;
    }
  }

  async restart() {
    console.log('🔄 Restarting browser...');
    await this.close();
    return await this.initialize();
  }

  isAlive() {
    return this.browser && this.browser.isConnected();
  }

  getStats() {
    return {
      isAlive: this.isAlive(),
      activePages: this.pageCount,
      lastUsed: this.lastUsedTime ? new Date(this.lastUsedTime).toISOString() : null,
      idleTime: this.lastUsedTime ? Math.floor((Date.now() - this.lastUsedTime) / 1000) : null
    };
  }
}

module.exports = new BrowserManager();