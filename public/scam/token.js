// public/scam/token.js
const SYMBOL_API = '/api/check-symbol';
const CACHE_DURATION = 14 * 24 * 60 * 60 * 1000;

function getCached(key) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const { data, timestamp } = JSON.parse(item);
        if (Date.now() - timestamp > CACHE_DURATION) { localStorage.removeItem(key); return null; }
        return data;
    } catch { return null; }
}
function setCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}

function card(label, value) {
    return '<div class="profile-card"><div class="pc-label">' + label + '</div><div class="pc-value">' + value + '</div></div>';
}

function badge(text) {
    if (!text) return '';
    const t = text.toUpperCase();
    const color = (t.includes('CRITICAL') || t.includes('EXTREME') || t.includes('SCAM') || t.includes('DANGER')) ? '#ef4444' :
        t.includes('HIGH') ? '#f59e0b' :
        (t.includes('MODERATE') || t.includes('MEDIUM')) ? '#8b5cf6' :
        (t.includes('LOW') || t.includes('SAFE') || t.includes('MINIMAL') || t.includes('NORMAL') || t.includes('DECENTRALIZED') || t.includes('EXCELLENT')) ? '#10b981' : '#6b7280';
    return '<span class="badge-tag" style="background:' + color + '20;color:' + color + '">' + text + '</span>';
}

async function loadToken(symbol) {
    if (!symbol) return;
    symbol = symbol.toUpperCase().trim();
    document.getElementById('navSearch').value = symbol;
    window.history.pushState({}, '', '/scam/token.html?symbol=' + symbol);
    document.title = symbol + ' Profile - BRIMIND Anti-Scam';

    const content = document.getElementById('tokenContent');
    content.innerHTML = '<div class="token-loading"><div class="spinner"></div><p>Loading ' + symbol + ' profile...</p></div>';

    const cacheKey = 'antiscam_symbol_' + symbol;
    const cached = getCached(cacheKey);
    let data;
    if (cached) {
        data = cached;
    } else {
        try {
            const res = await fetch(SYMBOL_API + '/' + symbol);
            data = await res.json();
            if (data && data.success) setCache(cacheKey, data);
        } catch (e) {
            content.innerHTML = '<div class="token-error"><div>❌</div><p>Failed to load token data for ' + symbol + '</p></div>';
            return;
        }
    }

    if (!data || !data.success) {
        content.innerHTML = '<div class="token-error"><div>🔍</div><p>Token "' + symbol + '" not found or no data available.</p></div>';
        return;
    }

    renderProfile(data, cached ? true : false);
}

function renderProfile(data, fromCache) {
    const m = data.marketData || {};
    const g = data.gapHunterBotRisk || {};
    const o = data.ownershipAnalysis || {};
    const h = data.holderConcentration || {};
    const t = data.tokenInfo || data.token || {};
    const ai = data.AIriskScore || g.AIriskScore || null;
    const scam = data.scamAssessment || null;
    const holders = h.top10HoldersDetailed || h.top10Holders || [];
    const exchanges = data.exchanges || [];
    const sources = data.dataSources || {};
    const sym = t.symbol || data.symbol || '?';

    const riskPct = g.riskPercentage || 0;
    const riskColor = riskPct >= 70 ? '#ef4444' : riskPct >= 40 ? '#f59e0b' : '#10b981';
    const riskBg = riskPct >= 70 ? '#fff5f5' : riskPct >= 40 ? '#fffbeb' : '#f0fdf4';

    let html = '';

    // Hero header
    html += '<div class="token-hero" style="border-top: 5px solid ' + riskColor + '">';
    html += '<div class="hero-left">';
    html += '<div class="hero-symbol">' + sym + '</div>';
    html += '<div class="hero-name">' + (t.name || '') + '</div>';
    if (t.network) html += '<div class="hero-meta">' + t.network.toUpperCase() + (t.type ? ' · ' + t.type : '') + '</div>';
    if (fromCache) html += '<span class="cache-chip">⚡ Cached</span>';
    html += '</div>';
    html += '<div class="hero-right">';
    html += '<div class="risk-circle" style="border-color:' + riskColor + ';color:' + riskColor + '">';
    html += '<div class="risk-pct">' + riskPct + '%</div>';
    html += '<div class="risk-lbl">Risk</div>';
    html += '</div>';
    html += '<div class="risk-rec" style="color:' + riskColor + ';background:' + riskBg + '">' + (g.recommendation || '') + '</div>';
    html += '</div></div>';

    if (t.description) html += '<div class="token-desc">' + t.description + '</div>';

    // Quick stats bar
    html += '<div class="quick-stats">';
    if (m.currentPrice) html += '<div class="qs-item"><div class="qs-val">$' + m.currentPrice + '</div><div class="qs-lbl">Price</div></div>';
    if (m.marketCap) html += '<div class="qs-item"><div class="qs-val">$' + formatLarge(m.marketCapRaw) + '</div><div class="qs-lbl">Market Cap</div></div>';
    if (m.volume24h) html += '<div class="qs-item"><div class="qs-val">$' + formatLarge(m.volume24hRaw) + '</div><div class="qs-lbl">Volume 24h</div></div>';
    if (m.priceChange24h) { const pos = !m.priceChange24h.startsWith('-'); html += '<div class="qs-item"><div class="qs-val" style="color:' + (pos ? '#10b981' : '#ef4444') + '">' + (pos ? '▲' : '▼') + ' ' + m.priceChange24h + '</div><div class="qs-lbl">24h Change</div></div>'; }
    if (m.marketCapRank) html += '<div class="qs-item"><div class="qs-val">#' + m.marketCapRank + '</div><div class="qs-lbl">CMC Rank</div></div>';
    if (exchanges.length) html += '<div class="qs-item"><div class="qs-val">' + exchanges.length + '</div><div class="qs-lbl">Exchanges</div></div>';
    html += '</div>';

    // Two column layout
    html += '<div class="profile-cols">';

    // Left column
    html += '<div class="profile-col">';

    // Market Data
    html += '<div class="p-section"><div class="p-section-title">📊 Market Data</div><div class="profile-grid">';
    if (m.currentPrice) html += card('💲 Price', '$' + m.currentPrice);
    if (m.marketCap) html += card('💰 Market Cap', '$' + m.marketCap);
    if (m.volume24h) html += card('📈 Volume 24h', '$' + m.volume24h);
    if (m.volumeToMarketCapPercentage) html += card('⚖️ Vol/MCap', m.volumeToMarketCapPercentage);
    if (m.priceChange24h) html += card('📉 Change 24h', m.priceChange24h);
    if (m.marketCapRank) html += card('🏆 CMC Rank', '#' + m.marketCapRank);
    if (m.circulatingSupply) html += card('🔄 Circulating', m.circulatingSupply);
    if (m.totalSupply) html += card('📦 Total Supply', m.totalSupply);
    if (m.maxSupply) html += card('🔒 Max Supply', m.maxSupply);
    if (m.ath) html += card('🚀 ATH', '$' + m.ath + (m.athDate ? ' <small>(' + new Date(m.athDate).toLocaleDateString() + ')</small>' : ''));
    if (m.atl) html += card('📉 ATL', '$' + m.atl);
    if (m.liquidityRisk) html += card('💧 Liquidity Risk', badge(m.liquidityRisk));
    if (typeof m.volumeAnomalyDetected !== 'undefined') html += card('🔍 Vol Anomaly', m.volumeAnomalyDetected ? '<span style="color:#ef4444">⚠ YES</span>' : '<span style="color:#10b981">✅ NO</span>');
    if (m.fullyDilutedValuation) html += card('💎 FDV', '$' + m.fullyDilutedValuation);
    html += '</div></div>';

    // GapHunter Risk
    html += '<div class="p-section"><div class="p-section-title">🤖 GapHunter Bot Risk</div><div class="profile-grid">';
    html += card('⚡ Risk %', '<strong style="color:' + riskColor + '">' + riskPct + '%</strong>');
    html += card('🚦 Should Skip', g.shouldSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    html += card('🛑 Hard Skip', g.hardSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    if (g.hardSkipReasons && g.hardSkipReasons.length) html += card('⚠️ Reasons', g.hardSkipReasons.join('<br>'));
    if (g.components) {
        Object.entries(g.components).forEach(function(e) {
            html += card('📌 ' + (e[1].description || e[0]) + ' (' + (e[1].weight || '') + ')', e[1].value + '/100');
        });
    }
    html += '</div></div>';

    html += '</div>'; // end left col

    // Right column
    html += '<div class="profile-col">';

    // Holder Concentration
    html += '<div class="p-section"><div class="p-section-title">👥 Holder Concentration</div><div class="profile-grid">';
    if (h.concentrationLevel) html += card('📊 Level', badge(h.concentrationLevel));
    if (h.top10Percentage) html += card('🔟 Top 10', h.top10Percentage + '%');
    if (h.top1Percentage) html += card('👑 Top 1', h.top1Percentage + '%');
    if (h.top1Label) html += card('🏷️ Top 1 Label', h.top1Label);
    if (h.top1Address) html += card('📍 Top 1 Addr', '<span class="mono">' + (h.top1Address || '').substring(0, 12) + '...</span>');
    html += card('☠️ Rug Pull Risk', h.rugPullRisk ? '<span style="color:#ef4444">⚠ HIGH</span>' : '<span style="color:#10b981">✅ LOW</span>');
    if (o.totalHolders) html += card('👥 Total Holders', o.totalHolders);
    if (o.dataSource) html += card('📡 Data Source', o.dataSource);
    html += '</div>';

    if (holders && holders.length > 0) {
        html += '<div class="holders-table-wrap"><table class="holders-table"><thead><tr><th>#</th><th>Address</th><th>%</th><th>Type</th></tr></thead><tbody>';
        holders.forEach(function(hh) {
            const htype = hh.isExchange ? '🏦' : hh.isBlackhole ? '🔥' : hh.isContract ? '📄' : '👤';
            html += '<tr><td>' + (hh.rank || '') + '</td><td class="mono">' + (hh.address || '').substring(0, 8) + '..' + (hh.address || '').slice(-4) + (hh.label ? '<br><small style="color:#888">' + hh.label + '</small>' : '') + '</td><td><strong>' + ((hh.percentage || 0).toFixed(3)) + '%</strong></td><td>' + htype + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    html += '</div>';

    // AI Risk
    if (ai) {
        const aiColor = ai.score >= 70 ? '#ef4444' : ai.score >= 40 ? '#f59e0b' : '#10b981';
        html += '<div class="p-section"><div class="p-section-title">🧠 AI Risk Analysis</div><div class="profile-grid">';
        html += card('🎯 AI Score', '<strong style="color:' + aiColor + '">' + ai.score + '/100</strong>');
        html += card('🏷️ Verdict', badge(ai.verdict));
        html += card('💬 Confidence', ai.confidence || '');
        if (ai.recommendation) html += card('💡 Recommendation', ai.recommendation);
        if (ai.tradingAdvice) html += card('📋 Trading Advice', ai.tradingAdvice);
        html += '</div>';
        if (ai.criticalIssues && ai.criticalIssues.length) { html += '<div class="flag-list critical">'; ai.criticalIssues.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (ai.warnings && ai.warnings.length) { html += '<div class="flag-list warning">'; ai.warnings.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (ai.positiveFactors && ai.positiveFactors.length) { html += '<div class="flag-list positive">'; ai.positiveFactors.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        html += '</div>';
    }

    // Scam Assessment
    if (scam) {
        html += '<div class="p-section"><div class="p-section-title">🛡️ Scam Assessment</div><div class="profile-grid">';
        if (scam.scamScore !== undefined) html += card('🎯 Scam Score', scam.scamScore + '/100');
        if (scam.verdict) html += card('🏷️ Verdict', badge(scam.verdict));
        if (scam.confidence) html += card('💬 Confidence', scam.confidence);
        html += '</div>';
        if (scam.summary) html += '<div class="scam-summary">' + scam.summary + '</div>';
        if (scam.redFlags && scam.redFlags.length) { html += '<div class="flag-list critical">'; scam.redFlags.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (scam.greenFlags && scam.greenFlags.length) { html += '<div class="flag-list positive">'; scam.greenFlags.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        html += '</div>';
    }

    html += '</div>'; // end right col
    html += '</div>'; // end profile-cols

    // Exchanges full width
    if (exchanges.length) {
        html += '<div class="p-section"><div class="p-section-title">🏦 Listed On ' + exchanges.length + ' Exchanges</div><div class="exchanges-list">';
        exchanges.forEach(function(ex) { html += '<span class="exchange-tag">' + ex + '</span>'; });
        html += '</div></div>';
    }

    // Data Sources
    html += '<div class="p-section"><div class="p-section-title">📡 Data Sources</div><div class="profile-grid">';
    html += card('CoinGecko', sources.coinGecko ? '✅' : '❌');
    html += card('CoinMarketCap', sources.coinMarketCap ? '✅' : '❌');
    html += card('Blockchain', sources.blockchain ? '✅' : '❌');
    if (data.holdersSourceUrl) html += card('🔗 Explorer', '<a href="' + data.holdersSourceUrl + '" target="_blank">View ↗</a>');
    html += '</div></div>';

    // Action buttons
    html += '<div class="token-actions">';
    html += '<a href="https://www.gate.io/fr/trade/' + sym + '_USDT" target="_blank" class="btn-action gate">🔗 Trade on Gate.io</a>';
    html += '<a href="https://coinmarketcap.com/currencies/' + (t.name || sym).toLowerCase().replace(/ /g, '-') + '/" target="_blank" class="btn-action cmc">📊 CoinMarketCap</a>';
    html += '<a href="https://www.coingecko.com/en/coins/' + (t.name || sym).toLowerCase().replace(/ /g, '-') + '" target="_blank" class="btn-action gecko">🦎 CoinGecko</a>';
    if (data.holdersSourceUrl) html += '<a href="' + data.holdersSourceUrl + '" target="_blank" class="btn-action explorer">🔍 Explorer</a>';
    html += '</div>';

    document.getElementById('tokenContent').innerHTML = html;
}

function formatLarge(n) {
    if (!n) return '0';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toString();
}

function setupNavSearch() {
    const input = document.getElementById('navSearch');
    const btn = document.getElementById('navSearchBtn');
    const suggestions = document.getElementById('navSuggestions');

    btn.addEventListener('click', function() {
        const val = input.value.trim();
        if (val) loadToken(val);
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const val = input.value.trim();
            if (val) loadToken(val);
            suggestions.style.display = 'none';
        }
    });

    // Live suggestions from cached symbols
    input.addEventListener('input', function() {
        const q = input.value.trim().toUpperCase();
        if (!q) { suggestions.style.display = 'none'; return; }
        const cachedSymbols = Object.keys(localStorage)
            .filter(k => k.startsWith('antiscam_symbol_'))
            .map(k => k.replace('antiscam_symbol_', ''))
            .filter(s => s.startsWith(q))
            .slice(0, 6);
        if (!cachedSymbols.length) { suggestions.style.display = 'none'; return; }
        suggestions.innerHTML = cachedSymbols.map(s => '<div class="suggestion-item" onclick="loadToken(\'' + s + '\')">' + s + ' <small>⚡ cached</small></div>').join('');
        suggestions.style.display = 'block';
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.nav-search')) suggestions.style.display = 'none';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    setupNavSearch();
    const params = new URLSearchParams(window.location.search);
    const sym = params.get('symbol');
    if (sym) loadToken(sym);
});
