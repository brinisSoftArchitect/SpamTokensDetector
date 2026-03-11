// public/scam/categories.js
const API_URL = '/api/categories';
const SYMBOL_API = '/api/check-symbol';
const CACHE_DURATION = 14 * 24 * 60 * 60 * 1000;

let categoriesData = null;
let currentFilter = 'scam';

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
function clearAllCache() {
    Object.keys(localStorage).filter(k => k.startsWith('antiscam_')).forEach(k => localStorage.removeItem(k));
}
function getCacheStats() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('antiscam_'));
    return { count: keys.length, tokens: keys.filter(k => k.startsWith('antiscam_symbol_')).length };
}

async function fetchCategories(forceRefresh = false) {
    const cacheKey = 'antiscam_categories';
    if (!forceRefresh) {
        const cached = getCached(cacheKey);
        if (cached) { categoriesData = cached; displayData(cached); showCacheBadge(true); return; }
    }
    showCacheBadge(false);
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('HTTP error: ' + response.status);
        categoriesData = await response.json();
        setCache(cacheKey, categoriesData);
        displayData(categoriesData);
    } catch (error) {
        console.error('Error fetching categories:', error);
        document.getElementById('categoriesGrid').innerHTML = '<div class="error">Failed to load categories. Please try again later.</div>';
    }
}

function showCacheBadge(fromCache) {
    const badge = document.getElementById('cacheBadge');
    if (!badge) return;
    badge.textContent = fromCache ? '⚡ From Cache' : '🌐 Live Data';
    badge.className = 'cache-badge ' + (fromCache ? 'cached' : 'live');
    badge.style.display = 'inline-block';
}

function displayData(data) {
    document.getElementById('totalCount').textContent = data.stats.total.toLocaleString();
    document.getElementById('trustedCount').textContent = data.stats.trusted.toLocaleString();
    document.getElementById('scamCount').textContent = data.stats.scam.toLocaleString();
    document.getElementById('undefinedCount').textContent = data.stats.undefined.toLocaleString();
    document.getElementById('minRisk').textContent = data.filters.minRiskPercentage;

    const allCategories = [
        ...data.lists.trusted.map(c => ({ name: c, type: 'trusted' })),
        ...data.lists.scam.map(c => ({ name: c, type: 'scam' })),
        ...data.lists.undefined.map(c => ({ name: c, type: 'undefined' }))
    ];

    document.getElementById('allCount').textContent = '(' + allCategories.length + ')';
    document.getElementById('trustedTabCount').textContent = '(' + data.lists.trusted.length + ')';
    document.getElementById('scamTabCount').textContent = '(' + data.lists.scam.length + ')';
    document.getElementById('undefinedTabCount').textContent = '(' + data.lists.undefined.length + ')';

    displayCategories(allCategories);
    filterCategories();
}

function displayCategories(categories) {
    const grid = document.getElementById('categoriesGrid');
    if (!categories || categories.length === 0) {
        grid.innerHTML = '<div class="loading">No categories found</div>';
        return;
    }
    grid.innerHTML = categories.map(cat => {
        const name = typeof cat === 'string' ? cat : cat.name;
        const type = typeof cat === 'string' ? 'undefined' : cat.type;
        return '<div class="category-tag ' + type + '" data-category="' + name + '" data-type="' + type + '" onclick="openTokenProfile(\'' + name + '\')">' + name + '</div>';
    }).join('');
}

async function openTokenProfile(symbol) {
    window.location.href = '/scam/token.html?symbol=' + symbol;
    return;
    // below kept for reference
    // eslint-disable-next-line no-unreachable
    const modal = document.getElementById('tokenModal');
    const modalBody = document.getElementById('modalBody');
    modal.style.display = 'flex';
    modalBody.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Loading ' + symbol + ' profile...</p></div>';
    document.getElementById('modalTitle').textContent = symbol + ' Profile';

    const cacheKey = 'antiscam_symbol_' + symbol;
    const cached = getCached(cacheKey);
    let data;
    if (cached) {
        data = cached;
        document.getElementById('modalCacheBadge').style.display = 'inline-block';
    } else {
        document.getElementById('modalCacheBadge').style.display = 'none';
        try {
            const res = await fetch(SYMBOL_API + '/' + symbol);
            data = await res.json();
            setCache(cacheKey, data);
        } catch (e) {
            modalBody.innerHTML = '<div class="error">Failed to load token data.</div>';
            return;
        }
    }
    renderTokenProfile(data);
    updateCacheStats();
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
        (t.includes('LOW') || t.includes('SAFE') || t.includes('MINIMAL') || t.includes('NORMAL') || t.includes('DECENTRALIZED')) ? '#10b981' : '#6b7280';
    return '<span style="background:' + color + '20;color:' + color + ';padding:2px 8px;border-radius:4px;font-size:.85em;font-weight:600">' + text + '</span>';
}

function renderTokenProfile(data) {
    const modalBody = document.getElementById('modalBody');
    if (!data || !data.success) { modalBody.innerHTML = '<div class="error">No data available.</div>'; return; }

    const m = data.marketData || {};
    const g = data.gapHunterBotRisk || {};
    const o = data.ownershipAnalysis || {};
    const h = data.holderConcentration || {};
    const t = data.tokenInfo || data.token || {};
    const ai = (data.AIriskScore) || (g.AIriskScore) || null;
    const scam = data.scamAssessment || null;
    const holders = h.top10HoldersDetailed || h.top10Holders || [];
    const exchanges = data.exchanges || [];
    const sources = data.dataSources || {};

    const riskPct = g.riskPercentage || 0;
    const riskColor = riskPct >= 70 ? '#ef4444' : riskPct >= 40 ? '#f59e0b' : '#10b981';
    const sym = t.symbol || data.symbol || '?';

    let html = '<div class="profile-header">';
    html += '<div class="profile-symbol">' + sym + '</div>';
    html += '<div class="profile-name">' + (t.name || '') + '</div>';
    if (t.network) html += '<div class="profile-network">' + t.network + (t.type ? ' · ' + t.type : '') + '</div>';
    if (t.description) html += '<div class="profile-desc">' + t.description + '</div>';
    html += '<div class="risk-meter">';
    html += '<div class="risk-bar-bg"><div class="risk-bar-fill" style="width:' + riskPct + '%;background:' + riskColor + '"></div></div>';
    html += '<div class="risk-label" style="color:' + riskColor + '">Risk: ' + riskPct + '% — ' + (g.recommendation || '') + '</div>';
    html += '</div></div>';

    // Market Data
    html += '<div class="profile-section"><h3>📊 Market Data</h3><div class="profile-grid">';
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
    if (m.liquidityRisk) html += card('💧 Liquidity Risk', badge(m.liquidityRisk));
    if (typeof m.volumeAnomalyDetected !== 'undefined') html += card('🔍 Vol Anomaly', m.volumeAnomalyDetected ? '<span style="color:#ef4444">⚠ YES</span>' : '<span style="color:#10b981">✅ NO</span>');
    html += '</div></div>';

    // Holder Concentration
    html += '<div class="profile-section"><h3>👥 Holder Concentration</h3><div class="profile-grid">';
    if (h.concentrationLevel) html += card('📊 Level', badge(h.concentrationLevel));
    if (h.top10Percentage) html += card('🔟 Top 10 Hold', h.top10Percentage + '%');
    if (h.top1Percentage) html += card('👑 Top 1 Hold', h.top1Percentage + '%');
    if (h.top1Label) html += card('🏷️ Top 1 Label', h.top1Label);
    if (h.top1Address) html += card('📍 Top 1 Addr', '<span class="mono">' + h.top1Address.substring(0, 10) + '...</span>');
    html += card('☠️ Rug Pull Risk', h.rugPullRisk ? '<span style="color:#ef4444">⚠ HIGH</span>' : '<span style="color:#10b981">✅ LOW</span>');
    if (o.totalHolders) html += card('👥 Total Holders', o.totalHolders);
    if (o.dataSource) html += card('📡 Source', o.dataSource);
    html += '</div>';

    if (holders && holders.length > 0) {
        html += '<div class="holders-table-wrap"><table class="holders-table"><thead><tr><th>#</th><th>Address</th><th>%</th><th>Type</th></tr></thead><tbody>';
        holders.forEach(function(hh) {
            const htype = hh.isExchange ? '🏦 Exchange' : hh.isBlackhole ? '🔥 Burn' : hh.isContract ? '📄 Contract' : '👤 Holder';
            html += '<tr><td>' + (hh.rank || '') + '</td><td class="mono">' + (hh.address || '').substring(0, 10) + '...' + (hh.address || '').slice(-4) + (hh.label ? '<br><small>' + hh.label + '</small>' : '') + '</td><td>' + ((hh.percentage || 0).toFixed(3)) + '%</td><td>' + htype + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    html += '</div>';

    // GapHunter Bot Risk
    html += '<div class="profile-section"><h3>🤖 GapHunter Bot Risk</h3><div class="profile-grid">';
    html += card('⚡ Risk %', '<strong style="color:' + riskColor + '">' + riskPct + '%</strong>');
    html += card('🚦 Should Skip', g.shouldSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    html += card('🛑 Hard Skip', g.hardSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    if (g.hardSkipReasons && g.hardSkipReasons.length) html += card('⚠️ Hard Skip Reasons', g.hardSkipReasons.join('<br>'));
    if (g.components) {
        Object.entries(g.components).forEach(function(entry) {
            html += card('📌 ' + (entry[1].description || entry[0]) + ' (' + (entry[1].weight || '') + ')', entry[1].value + '/100');
        });
    }
    html += '</div></div>';

    // AI Risk Score
    if (ai) {
        const aiColor = ai.score >= 70 ? '#ef4444' : ai.score >= 40 ? '#f59e0b' : '#10b981';
        html += '<div class="profile-section"><h3>🧠 AI Risk Analysis</h3><div class="profile-grid">';
        html += card('🎯 AI Score', '<strong style="color:' + aiColor + '">' + ai.score + '/100</strong>');
        html += card('🏷️ Verdict', badge(ai.verdict));
        html += card('💬 Confidence', ai.confidence || '');
        if (ai.recommendation) html += card('💡 Recommendation', ai.recommendation);
        if (ai.tradingAdvice) html += card('📋 Trading Advice', ai.tradingAdvice);
        html += '</div>';
        if (ai.criticalIssues && ai.criticalIssues.length) {
            html += '<div class="flag-list critical">';
            ai.criticalIssues.forEach(function(f) { html += '<div>' + f + '</div>'; });
            html += '</div>';
        }
        if (ai.warnings && ai.warnings.length) {
            html += '<div class="flag-list warning">';
            ai.warnings.forEach(function(f) { html += '<div>' + f + '</div>'; });
            html += '</div>';
        }
        if (ai.positiveFactors && ai.positiveFactors.length) {
            html += '<div class="flag-list positive">';
            ai.positiveFactors.forEach(function(f) { html += '<div>' + f + '</div>'; });
            html += '</div>';
        }
        html += '</div>';
    }

    // Scam Assessment
    if (scam) {
        html += '<div class="profile-section"><h3>🛡️ Scam Assessment</h3><div class="profile-grid">';
        if (scam.scamScore !== undefined) html += card('🎯 Scam Score', scam.scamScore + '/100');
        if (scam.verdict) html += card('🏷️ Verdict', badge(scam.verdict));
        if (scam.confidence) html += card('💬 Confidence', scam.confidence);
        html += '</div>';
        if (scam.summary) html += '<div class="scam-summary">' + scam.summary + '</div>';
        if (scam.redFlags && scam.redFlags.length) {
            html += '<div class="flag-list critical">';
            scam.redFlags.forEach(function(f) { html += '<div>' + f + '</div>'; });
            html += '</div>';
        }
        if (scam.greenFlags && scam.greenFlags.length) {
            html += '<div class="flag-list positive">';
            scam.greenFlags.forEach(function(f) { html += '<div>' + f + '</div>'; });
            html += '</div>';
        }
        html += '</div>';
    }

    // Exchanges
    if (exchanges.length) {
        html += '<div class="profile-section"><h3>🏦 Listed On ' + exchanges.length + ' Exchanges</h3><div class="exchanges-list">';
        exchanges.forEach(function(ex) { html += '<span class="exchange-tag">' + ex + '</span>'; });
        html += '</div></div>';
    }

    // Data Sources
    html += '<div class="profile-section"><h3>📡 Data Sources</h3><div class="profile-grid">';
    html += card('CoinGecko', sources.coinGecko ? '✅' : '❌');
    html += card('CoinMarketCap', sources.coinMarketCap ? '✅' : '❌');
    html += card('Blockchain', sources.blockchain ? '✅' : '❌');
    if (data.holdersSourceUrl) html += card('🔗 Explorer', '<a href="' + data.holdersSourceUrl + '" target="_blank">View</a>');
    html += '</div></div>';

    // Action buttons
    html += '<div class="profile-actions">';
    html += '<a href="https://www.gate.io/fr/trade/' + sym + '_USDT" target="_blank" class="btn-action gate">🔗 Trade on Gate.io</a>';
    html += '<a href="https://coinmarketcap.com/currencies/' + (t.name || '').toLowerCase().replace(/ /g, '-') + '/" target="_blank" class="btn-action cmc">📊 CoinMarketCap</a>';
    html += '<a href="https://www.coingecko.com/en/coins/' + (t.name || '').toLowerCase().replace(/ /g, '-') + '" target="_blank" class="btn-action gecko">🦎 CoinGecko</a>';
    html += '</div>';

    modalBody.innerHTML = html;
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', filterCategories);
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            currentFilter = btn.dataset.type;
            filterCategories();
        });
    });
}

function filterCategories() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.category-tag').forEach(function(tag) {
        const matches = tag.dataset.category.toLowerCase().includes(searchTerm);
        const matchesFilter = currentFilter === 'all' || tag.dataset.type === currentFilter;
        tag.classList.toggle('hidden', !(matches && matchesFilter));
    });
}

function setupModal() {
    document.getElementById('modalOverlay').addEventListener('click', closeModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
}

function closeModal() {
    document.getElementById('tokenModal').style.display = 'none';
}

function setupClearCache() {
    document.getElementById('clearCacheBtn').addEventListener('click', function() {
        if (confirm('Clear all cached data? The page will reload fresh data.')) {
            clearAllCache();
            fetchCategories(true);
            updateCacheStats();
        }
    });
}

function updateCacheStats() {
    const stats = getCacheStats();
    const el = document.getElementById('cacheStats');
    if (el) el.textContent = stats.tokens + ' token' + (stats.tokens !== 1 ? 's' : '') + ' cached';
}

document.addEventListener('DOMContentLoaded', function() {
    fetchCategories();
    setupSearch();
    setupTabs();
    setupModal();
    setupClearCache();
    updateCacheStats();
});
