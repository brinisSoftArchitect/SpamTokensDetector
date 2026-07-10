// server.js - Main server file
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const spamDetectorRoutes = require('./routes/spamDetector');
const categoriesRoutes = require('./routes/categories');
const tokenListsRoutes = require('./routes/tokenLists');
const cronService = require('./services/cronService');
const cacheService = require('./services/cacheService');
require('./modules/ST/ST'); // starts ST token background fetch/cron (independent tag, not a scam category)

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/scam', express.static('public/scam'));

app.use(express.static('public'));
app.use('/api', spamDetectorRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', tokenListsRoutes);

app.delete('/api/cache/clear/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        await cacheService.clearToken(symbol);
        res.json({ success: true, message: `Cache cleared for ${symbol}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BRIMIND Anti-Scam Hub</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; line-height: 1.6; }
        .container { max-width: 900px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 40px; }
        h1 { font-size: 2.5rem; color: #38bdf8; margin-bottom: 10px; }
        .subtitle { color: #94a3b8; font-size: 1.1rem; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
        @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
        .card { background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; transition: transform 0.2s, border-color 0.2s; text-decoration: none; color: inherit; display: block; }
        .card:hover { transform: translateY(-2px); border-color: #38bdf8; }
        .card h2 { margin-top: 0; font-size: 1.4rem; color: #f1f5f9; display: flex; align-items: center; gap: 10px; }
        .card p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 0; }
        .btn { display: inline-block; background: #38bdf8; color: #0f172a; font-weight: bold; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
        .section { background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; margin-bottom: 20px; }
        .section h3 { margin-top: 0; color: #e2e8f0; border-bottom: 1px solid #334155; padding-bottom: 10px; }
        ul { padding-left: 20px; margin: 0; }
        li { margin-bottom: 10px; color: #cbd5e1; }
        a.inline-link { color: #38bdf8; text-decoration: none; }
        a.inline-link:hover { text-decoration: underline; }
        code { background: #0f172a; color: #f472b6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🛡️ BRIMIND Anti-Scam Gateway</h1>
          <p class="subtitle">Central control unit for ecosystem protection and token threat metrics</p>
        </header>

        <div class="grid">
          <a href="/scam/" class="card">
            <h2>📊 Management Dashboard</h2>
            <p>Access the unified visual layout displaying trusted, undefined, and scam categories alongside live filter sets and synchronized ST tags.</p>
            <span class="btn">Open Dashboard</span>
          </a>
          <a href="/api/st-tokens" class="card">
            <h2>⭐ ST Token Index</h2>
            <p>Inspect active spot pair data configurations populated from Gate.io REST API validation checks running under the automated 30-minute cron engine.</p>
            <span class="btn" style="background: #e2e8f0;">View JSON Layer</span>
          </a>
        </div>

        <div class="section">
          <h3>📚 System documentation & Core API Endpoints</h3>
          <ul>
            <li><strong>Check Token (GET):</strong> <code>/api/check-token/{network}/{contractAddress}</code><br>Verifies honeypot triggers and holder profiles dynamically.</li>
            <li><strong>Cross-Chain Symbol Scan (GET):</strong> <code>/api/check-symbol/{symbol}</code><br>Audits instances for identical ticker markers universally across known networks.</li>
            <li><strong>Concentration Analytics (GET):</strong> <code>/api/top-holders/{network}/{contractAddress}</code><br>Inspects whale clustering percentages and contract distributions.</li>
          </ul>
        </div>

        <div class="section">
          <h3>🔍 Interactive Live Sandbox Links</h3>
          <ul>
            <li>Verify Ethereum Token Sample: <a class="inline-link" href="/api/check-token/eth/0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9" target="_blank"><code>/api/check-token/eth/0x50d1c9...</code></a></li>
            <li>Analyze Ticker Profile (FTT): <a class="inline-link" href="/api/check-symbol/FTT" target="_blank"><code>/api/check-symbol/FTT</code></a></li>
            <li>Inspect Wallet Profiles: <a class="inline-link" href="/api/top-holders/eth/0x50d1c9771902476076ecfc8b2a83ad6b9355a4c9" target="_blank"><code>/api/top-holders/eth/0x50d1c9...</code></a></li>
            <li>Fetch Sample Token Registry: <a class="inline-link" href="/api/examples" target="_blank"><code>/api/examples</code></a></li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  cronService.start();

  // Pre-warm browser on startup to avoid cold-start delay on first request
  setTimeout(async () => {
    try {
      const browserManager = require('./services/browserManager');
      console.log('🔥 Pre-warming browser instance...');
      await browserManager.initialize();
      console.log('✅ Browser pre-warmed and ready');
    } catch (e) {
      console.log('⚠️ Browser pre-warm failed (non-critical):', e.message);
    }
  }, 3000);
});