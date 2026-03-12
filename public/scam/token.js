// public/scam/token.js
const SYMBOL_API = '/api/check-symbol';

function card(label, value) {
    return '<div class="profile-card"><div class="pc-label">' + label + '</div><div class="pc-value">' + value + '</div></div>';
}

function badge(text) {
    if (!text) return '';
    var t = text.toUpperCase();
    var color = (t.includes('CRITICAL') || t.includes('EXTREME') || t.includes('SCAM') || t.includes('DANGER')) ? '#ef4444' :
        t.includes('HIGH') ? '#f59e0b' :
        (t.includes('MODERATE') || t.includes('MEDIUM')) ? '#8b5cf6' :
        (t.includes('LOW') || t.includes('SAFE') || t.includes('MINIMAL') || t.includes('NORMAL') || t.includes('DECENTRALIZED') || t.includes('EXCELLENT')) ? '#10b981' : '#6b7280';
    return '<span class="badge-tag" style="background:' + color + '20;color:' + color + '">' + text + '</span>';
}

function sourceCard(name, icon, active) {
    var cls = active ? 'source-active' : 'source-inactive';
    var status = active ? '&#x2705; Connected' : '&#x274C; No data';
    return '<div class="source-card ' + cls + '"><div class="source-icon">' + icon + '</div><div class="source-name">' + name + '</div><div class="source-status">' + status + '</div></div>';
}

function formatLarge(n) {
    if (!n) return '0';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toString();
}

async function loadToken(symbol) {
    if (!symbol) return;
    symbol = symbol.toUpperCase().trim();
    document.getElementById('navSearch').value = symbol;
    window.history.pushState({}, '', '/scam/token.html?symbol=' + symbol);
    document.title = symbol + ' Profile - BRIMIND Anti-Scam';

    var content = document.getElementById('tokenContent');
    content.innerHTML = '<div class="token-loading"><div class="spinner"></div><p>Loading ' + symbol + ' profile...</p></div>';

    try {
        var res = await fetch(SYMBOL_API + '/' + symbol);
        var data = await res.json();
        if (!data || !data.success) {
            content.innerHTML = '<div class="token-error"><div>&#x1F50D;</div><p>Token "' + symbol + '" not found or no data available.</p></div>';
            return;
        }
        var fromCache = res.headers.get('X-Cache') === 'HIT';
        renderProfile(data, fromCache);
    } catch (e) {
        content.innerHTML = '<div class="token-error"><div>&#x274C;</div><p>Failed to load token data for ' + symbol + '</p></div>';
    }
}

function renderProfile(data, fromCache) {
    var chainData = (data.chains && data.chains[0] && data.chains[0].analysis) ? data.chains[0].analysis : data;
    var m = chainData.marketData || data.marketData || {};
    var g = data.gapHunterBotRisk || chainData.gapHunterBotRisk || {};
    var h = chainData.holderConcentration || data.holderConcentration || {};
    var t = chainData.token || chainData.tokenInfo || data.tokenInfo || data.token || {};
    var ai = g.AIriskScore || data.AIriskScore || null;
    var scam = chainData.scamAssessment || data.scamAssessment || null;
    var holders = h.top10HoldersDetailed || h.top10Holders || [];
    var exchanges = chainData.exchanges || data.exchanges || [];
    var sources = chainData.dataSources || data.dataSources || {};
    var allExplorers = data.allExplorers || [];
    var sym = data.symbol || t.symbol || '?';
    var perChainRisks = g.perChainRisks || [];

    var riskPct = g.riskPercentage || 0;
    var riskColor = riskPct >= 70 ? '#ef4444' : riskPct >= 40 ? '#f59e0b' : '#10b981';
    var riskBg = riskPct >= 70 ? '#fff5f5' : riskPct >= 40 ? '#fffbeb' : '#f0fdf4';

    var html = '';

    // Clear cache button (only if cached)
    // Hero
    html += '<div class="token-hero" style="border-top:5px solid ' + riskColor + '">';
    html += '<div class="hero-left">';
    html += '<div class="hero-symbol">' + sym + '</div>';
    if (t.name) html += '<div class="hero-name">' + t.name + '</div>';
    if (t.network) html += '<div class="hero-meta">' + t.network.toUpperCase() + (t.verified === false ? ' &middot; &#x26A0; Unverified' : ' &middot; &#x2705; Verified') + '</div>';
    html += '<div class="hero-badges">';
    if (fromCache) html += '<span class="cache-chip">&#x26A1; Cached</span> <button class="btn-clear-cache" onclick="window._clearTokenCache()">🔄 Refresh</button>';
    if (data.isSpamGlobally) html += '<span class="hero-chip spam">&#x1F6A8; Spam</span>';
    if (data.overallRisk) html += '<span class="hero-chip risk-' + data.overallRisk.toLowerCase() + '">' + data.overallRisk + '</span>';
    if (data.chainsFound) html += '<span class="hero-chip neutral">&#x26D3; ' + data.chainsFound + ' chain' + (data.chainsFound > 1 ? 's' : '') + '</span>';
    html += '</div></div>';
    html += '<div class="hero-right">';
    html += '<div class="risk-circle" style="border-color:' + riskColor + ';color:' + riskColor + '">';
    html += '<div class="risk-pct">' + riskPct + '%</div><div class="risk-lbl">Risk</div></div>';
    html += '<div class="risk-rec" style="color:' + riskColor + ';background:' + riskBg + '">' + (g.recommendation || '') + '</div>';
    html += '</div></div>';

    if (t.description) html += '<div class="token-desc">' + t.description + '</div>';

    // Quick stats
    html += '<div class="quick-stats">';
    if (m.currentPrice) html += '<div class="qs-item"><div class="qs-val">$' + m.currentPrice + '</div><div class="qs-lbl">Price</div></div>';
    if (m.marketCapRaw) html += '<div class="qs-item"><div class="qs-val">$' + formatLarge(m.marketCapRaw) + '</div><div class="qs-lbl">Market Cap</div></div>';
    if (m.volume24hRaw) html += '<div class="qs-item"><div class="qs-val">$' + formatLarge(m.volume24hRaw) + '</div><div class="qs-lbl">Volume 24h</div></div>';
    if (m.priceChange24h) { var pos = !String(m.priceChange24h).startsWith('-'); html += '<div class="qs-item"><div class="qs-val" style="color:' + (pos ? '#10b981' : '#ef4444') + '">' + (pos ? '&#x25B2;' : '&#x25BC;') + ' ' + m.priceChange24h + '</div><div class="qs-lbl">24h Change</div></div>'; }
    if (m.marketCapRank) html += '<div class="qs-item"><div class="qs-val">#' + m.marketCapRank + '</div><div class="qs-lbl">CMC Rank</div></div>';
    if (exchanges.length) html += '<div class="qs-item"><div class="qs-val">' + exchanges.length + '</div><div class="qs-lbl">Exchanges</div></div>';
    if (data.globalSpamScore !== undefined) html += '<div class="qs-item"><div class="qs-val" style="color:' + (data.globalSpamScore >= 70 ? '#ef4444' : data.globalSpamScore >= 40 ? '#f59e0b' : '#10b981') + '">' + data.globalSpamScore + '/100</div><div class="qs-lbl">Spam Score</div></div>';
    html += '</div>';

    // Two columns
    html += '<div class="profile-cols">';
    html += '<div class="profile-col">';

    // Market Data
    html += '<div class="p-section"><div class="p-section-title">&#x1F4CA; Market Data</div><div class="profile-grid">';
    if (m.currentPrice) html += card('&#x1F4B2; Price', '$' + m.currentPrice);
    if (m.marketCap) html += card('&#x1F4B0; Market Cap', '$' + m.marketCap);
    if (m.volume24h) html += card('&#x1F4C8; Volume 24h', '$' + m.volume24h);
    if (m.volumeToMarketCapPercentage) html += card('&#x2696;&#xFE0F; Vol/MCap', m.volumeToMarketCapPercentage);
    if (m.priceChange24h) html += card('&#x1F4C9; Change 24h', m.priceChange24h);
    if (m.marketCapRank) html += card('&#x1F3C6; CMC Rank', '#' + m.marketCapRank);
    if (m.circulatingSupply) html += card('&#x1F504; Circulating', m.circulatingSupply);
    if (m.totalSupply) html += card('&#x1F4E6; Total Supply', m.totalSupply);
    if (m.maxSupply) html += card('&#x1F512; Max Supply', m.maxSupply);
    if (m.ath) html += card('&#x1F680; ATH', '$' + m.ath + (m.athDate ? ' <small>(' + new Date(m.athDate).toLocaleDateString() + ')</small>' : ''));
    if (m.atl) html += card('&#x1F4C9; ATL', '$' + m.atl);
    if (m.liquidityRisk) html += card('&#x1F4A7; Liquidity Risk', badge(m.liquidityRisk));
    if (typeof m.volumeAnomalyDetected !== 'undefined') html += card('&#x1F50D; Vol Anomaly', m.volumeAnomalyDetected ? '<span style="color:#ef4444">&#x26A0; YES</span>' : '<span style="color:#10b981">&#x2705; NO</span>');
    if (m.fullyDilutedValuation) html += card('&#x1F48E; FDV', '$' + m.fullyDilutedValuation);
    html += '</div></div>';

    // GapHunter Risk
    var hasHolderData = h.dataSource && h.dataSource !== 'none' && h.dataSource !== 'unknown' && (h.top10Percentage > 0 || h.top1Percentage > 0);
    html += '<div class="p-section"><div class="p-section-title">&#x1F916; GapHunter Bot Risk</div>';
    html += '<div class="profile-grid">';
    html += card('&#x26A1; Risk %', '<strong style="color:' + riskColor + '">' + riskPct + '%</strong>');
    html += card('&#x1F6A6; Should Skip', g.shouldSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    html += card('&#x1F6D1; Hard Skip', g.hardSkip ? '<span style="color:#ef4444">YES</span>' : '<span style="color:#10b981">NO</span>');
    if (g.hardSkipReasons && g.hardSkipReasons.length) html += card('&#x26A0;&#xFE0F; Hard Skip Reasons', g.hardSkipReasons.join('<br>'));
    html += '</div>';

    if (g.components) {
        var c = g.components;
        var excluded = g.excludedComponents || [];

        // Build formula string from only active components
        var rowDefs = [
            { key: 'H', label: 'H', desc: 'Holder Concentration', color: '#6366f1',
              hint: 'How concentrated token supply is among top 10 wallets. High concentration = easy rug pull. Score = 100 if top10 > 25% OR top1 > 10%.' },
            { key: 'U', label: 'U', desc: 'Unverified Contract', color: '#f59e0b',
              hint: 'Whether the smart contract is verified on the blockchain explorer. Unverified = harder to audit.' },
            { key: 'M', label: 'M', desc: 'Microcap Risk', color: '#ef4444',
              hint: 'Market cap size risk. Smaller mcap = easier to manipulate price.' },
            { key: 'V', label: 'V', desc: 'Volume Anomaly', color: '#8b5cf6',
              hint: 'Volume/MCap ratio. Ideal range: 50-300%. Too low = dead token, too high = wash trading.' },
            { key: 'P', label: 'P', desc: 'Spam / Platform Flags', color: '#10b981',
              hint: 'Spam score derived from exchange count, verification, and market signals.' }
        ];

        var activeParts = rowDefs
            .filter(function(r) { return excluded.indexOf(r.key) === -1; })
            .map(function(r) {
                var comp = c[r.key] || {};
                return r.label + '&times;' + comp.weight;
            });
        var formulaStr = activeParts.join(' + ');
        if (excluded.length > 0) {
            formulaStr += '<br><small style="color:#888">Excluded (no data): ' + excluded.join(', ') + ' &mdash; weights redistributed among available components</small>';
        }

        html += '<div class="formula-box">';
        html += '<div class="formula-title">&#x1F9EE; Score Formula</div>';
        html += '<div class="formula-eq">Risk% = ' + formulaStr + '</div>';
        html += '<table class="formula-table">';
        html += '<thead><tr><th>Component</th><th>Description</th><th>Weight</th><th>Value</th><th>Contribution</th></tr></thead>';
        html += '<tbody>';

        var total = 0;
        rowDefs.forEach(function(r) {
            var comp = c[r.key] || { value: 0, weight: '0%', excluded: true };
            var isExcluded = comp.excluded || excluded.indexOf(r.key) !== -1;
            var v = comp.value || 0;
            var wNum = parseFloat((comp.weight || '0').replace('%','').replace(' (no data)','')) / 100;
            var contrib = wNum * v;
            if (!isExcluded) total += contrib;
            var rowColor = isExcluded ? '#9ca3af' : r.color;
            var vColor = isExcluded ? '#9ca3af' : (v >= 70 ? '#ef4444' : v >= 40 ? '#f59e0b' : '#10b981');
            var cColor = isExcluded ? '#9ca3af' : (contrib >= 15 ? '#ef4444' : contrib >= 7 ? '#f59e0b' : '#10b981');
            html += '<tr style="opacity:' + (isExcluded ? '0.3' : '1') + '">';
            html += '<td><span class="formula-badge" style="background:' + rowColor + '20;color:' + rowColor + ';border:1px solid ' + rowColor + '40">' + r.label + '</span></td>';
            html += '<td style="color:#374151;font-size:12px"><strong>' + r.desc + '</strong>';
            if (isExcluded) html += ' <em style="color:#9ca3af">(excluded — no data)</em>';
            html += '<br><span style="color:#9ca3af;font-size:11px">' + r.hint + '</span></td>';
            html += '<td><strong style="color:' + rowColor + '">' + comp.weight + '</strong></td>';
            if (isExcluded) {
                html += '<td><span style="color:#9ca3af">N/A</span></td><td><span style="color:#9ca3af">—</span></td>';
            } else {
                html += '<td><strong style="color:' + vColor + '">' + v.toFixed(1) + '</strong><span style="color:#9ca3af">/100</span></td>';
                html += '<td><strong style="color:' + cColor + '">+' + contrib.toFixed(2) + '%</strong></td>';
            }
            html += '</tr>';
        });

        html += '<tr class="formula-total-row"><td colspan="4"><strong>Total Risk Score</strong>';
        if (excluded.length) html += ' <small style="color:#9ca3af">(based on ' + activeParts.length + '/' + rowDefs.length + ' components)</small>';
        html += '</td>';
        html += '<td><strong style="color:' + riskColor + ';font-size:15px">' + riskPct + '%</strong></td></tr>';
        html += '</tbody></table>';
        html += '</div>';
    }
    html += '</div>';
    html += '</div>'; // end left col

    // Right column
    html += '<div class="profile-col">';

    // Holder Concentration
    html += '<div class="p-section"><div class="p-section-title">&#x1F465; Holder Concentration</div><div class="profile-grid">';
    if (h.concentrationLevel) html += card('&#x1F4CA; Level', badge(h.concentrationLevel));
    if (h.top10Percentage !== undefined) html += card('&#x1F51F; Top 10', '<strong>' + h.top10Percentage + '%</strong>');
    if (h.top1Percentage !== undefined) html += card('&#x1F451; Top 1 Wallet', '<strong>' + h.top1Percentage + '%</strong>');
    if (h.top1Label) html += card('&#x1F3F7;&#xFE0F; Top 1 Label', h.top1Label);
    if (h.top1Address) html += card('&#x1F4CD; Top 1 Addr', '<a href="https://etherscan.io/address/' + h.top1Address + '" target="_blank" class="mono">' + h.top1Address.substring(0,8) + '...' + h.top1Address.slice(-4) + ' &#x2197;</a>');
    html += card('&#x2620;&#xFE0F; Rug Pull Risk', h.rugPullRisk ? '<span style="color:#ef4444">&#x26A0; HIGH</span>' : '<span style="color:#10b981">&#x2705; LOW</span>');
    html += card('&#x1F464; Top 1 Is Exchange', h.top1IsExchange ? '<span style="color:#10b981">&#x2705; Yes</span>' : '<span style="color:#ef4444">&#x274C; No</span>');
    html += card('&#x1F525; Top 1 Blackhole', h.top1IsBlackhole ? '<span style="color:#ef4444">&#x26A0; Yes</span>' : '<span style="color:#10b981">&#x2705; No</span>');
    if (h.blackholePercentage) html += card('&#x1F525; Blackhole %', h.blackholePercentage + '%');
    if (h.totalHolders) html += card('&#x1F465; Total Holders', h.totalHolders);
    if (h.dataSource) html += card('&#x1F4E1; Data Source', h.dataSource);
    if (h.analysisMethod) html += card('&#x1F52C; Method', h.analysisMethod);
    html += '</div>';

    if (holders && holders.length > 0) {
        html += '<div class="holders-table-wrap"><table class="holders-table"><thead><tr><th>#</th><th>Address</th><th>%</th><th>Type</th></tr></thead><tbody>';
        holders.forEach(function(hh) {
            var htype = hh.isExchange ? '&#x1F3E6;' : hh.isBlackhole ? '&#x1F525;' : hh.isContract ? '&#x1F4C4;' : '&#x1F464;';
            html += '<tr><td>' + (hh.rank || '') + '</td><td class="mono">' + (hh.address || '').substring(0,8) + '..' + (hh.address || '').slice(-4) + (hh.label ? '<br><small style="color:#888">' + hh.label + '</small>' : '') + '</td><td><strong>' + ((hh.percentage || 0).toFixed(3)) + '%</strong></td><td>' + htype + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    html += '</div>';

    // AI Risk
    if (ai) {
        var aiColor = ai.score >= 70 ? '#ef4444' : ai.score >= 40 ? '#f59e0b' : '#10b981';
        html += '<div class="p-section"><div class="p-section-title">&#x1F9E0; AI Risk Analysis</div><div class="profile-grid">';
        html += card('&#x1F3AF; AI Score', '<strong style="color:' + aiColor + '">' + ai.score + '/100</strong>');
        html += card('&#x1F3F7;&#xFE0F; Verdict', badge(ai.verdict));
        html += card('&#x1F4AC; Confidence', ai.confidence || '');
        if (ai.recommendation) html += card('&#x1F4A1; Recommendation', ai.recommendation);
        if (ai.tradingAdvice) html += card('&#x1F4CB; Trading Advice', ai.tradingAdvice);
        html += '</div>';
        if (ai.criticalIssues && ai.criticalIssues.length) { html += '<div class="flag-list critical">'; ai.criticalIssues.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (ai.warnings && ai.warnings.length) { html += '<div class="flag-list warning">'; ai.warnings.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (ai.positiveFactors && ai.positiveFactors.length) { html += '<div class="flag-list positive">'; ai.positiveFactors.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        html += '</div>';
    }

    // Scam Assessment
    if (scam) {
        html += '<div class="p-section"><div class="p-section-title">&#x1F6E1;&#xFE0F; Scam Assessment</div><div class="profile-grid">';
        if (scam.scamScore !== undefined) html += card('&#x1F3AF; Scam Score', scam.scamScore + '/100');
        if (scam.verdict) html += card('&#x1F3F7;&#xFE0F; Verdict', badge(scam.verdict));
        if (scam.confidence) html += card('&#x1F4AC; Confidence', scam.confidence);
        html += '</div>';
        if (scam.summary) html += '<div class="scam-summary">' + scam.summary + '</div>';
        if (scam.redFlags && scam.redFlags.length) { html += '<div class="flag-list critical">'; scam.redFlags.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        if (scam.greenFlags && scam.greenFlags.length) { html += '<div class="flag-list positive">'; scam.greenFlags.forEach(function(f) { html += '<div>' + f + '</div>'; }); html += '</div>'; }
        html += '</div>';
    }

    html += '</div>'; // end right col
    html += '</div>'; // end profile-cols

    // Exchanges
    if (exchanges.length) {
        html += '<div class="p-section"><div class="p-section-title">&#x1F3E6; Listed On ' + exchanges.length + ' Exchanges</div><div class="exchanges-list">';
        exchanges.forEach(function(ex) { html += '<span class="exchange-tag">' + ex + '</span>'; });
        html += '</div></div>';
    }

    // Summary
    if (data.summary) html += '<div class="p-section"><div class="p-section-title">&#x1F4CB; Summary</div><div class="scam-summary">' + data.summary + '</div></div>';

    // Per-chain risks
    if (perChainRisks.length > 1) {
        html += '<div class="p-section"><div class="p-section-title">&#x26D3; Per-Chain Risk</div><div class="profile-grid">';
        perChainRisks.forEach(function(c) {
            var cc = c.riskPercentage >= 70 ? '#ef4444' : c.riskPercentage >= 40 ? '#f59e0b' : '#10b981';
            html += card(c.network.toUpperCase(), '<strong style="color:' + cc + '">' + c.riskPercentage + '%</strong>' + (c.hardSkip ? ' &#x1F6D1;' : ''));
        });
        html += '</div></div>';
    }

    // Explorer links
    if (allExplorers.length) {
        html += '<div class="p-section"><div class="p-section-title">&#x1F517; Block Explorers</div><div class="exchanges-list">';
        allExplorers.forEach(function(e) {
            html += '<a href="' + e.url + '" target="_blank" class="exchange-tag">' + (e.network || '').toUpperCase() + ' &#x2197;</a>';
        });
        html += '</div></div>';
    }

    // Data Sources
    html += '<div class="p-section"><div class="p-section-title">&#x1F4E1; Data Sources</div><div class="sources-grid">';
    html += sourceCard('CoinGecko', '&#x1F98E;', sources.coinGecko);
    html += sourceCard('CoinMarketCap', '&#x1F4CA;', sources.coinMarketCap);
    html += sourceCard('Blockchain', '&#x26D3;', sources.blockchain);
    var explorerUrl = chainData.holdersSourceUrl || data.holdersSourceUrl || '';
    if (explorerUrl) {
        html += '<div class="source-card source-link"><div class="source-icon">&#x1F50D;</div><div class="source-name">Explorer</div><a href="' + explorerUrl + '" target="_blank" class="source-status">View &#x2197;</a></div>';
    }
    html += '</div></div>';

    // Actions
    html += '<div class="token-actions">';
    html += '<a href="https://www.gate.io/fr/trade/' + sym + '_USDT" target="_blank" class="btn-action gate">&#x1F517; Gate.io</a>';
    html += '<a href="https://coinmarketcap.com/currencies/' + (t.name || sym).toLowerCase().replace(/ /g, '-') + '/" target="_blank" class="btn-action cmc">&#x1F4CA; CoinMarketCap</a>';
    html += '<a href="https://www.coingecko.com/en/coins/' + (t.name || sym).toLowerCase().replace(/ /g, '-') + '" target="_blank" class="btn-action gecko">&#x1F98E; CoinGecko</a>';
    if (explorerUrl) html += '<a href="' + explorerUrl + '" target="_blank" class="btn-action explorer">&#x1F50D; Explorer</a>';
    html += '</div>';

    document.getElementById('tokenContent').innerHTML = html;
}

function setupNavSearch() {
    var input = document.getElementById('navSearch');
    var btn = document.getElementById('navSearchBtn');
    var suggestions = document.getElementById('navSuggestions');

    btn.addEventListener('click', function() {
        var val = input.value.trim();
        if (val) loadToken(val);
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var val = input.value.trim();
            if (val) loadToken(val);
            suggestions.style.display = 'none';
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.nav-search')) suggestions.style.display = 'none';
    });
}

window._clearTokenCache = function() {
    var params = new URLSearchParams(window.location.search);
    var sym = params.get('symbol');
    if (!sym) return;
    sym = sym.toUpperCase().trim();
    fetch('/api/cache/clear/' + sym, { method: 'DELETE' })
        .then(function() { loadToken(sym); })
        .catch(function() { loadToken(sym); });
};

document.addEventListener('DOMContentLoaded', function() {
    setupNavSearch();
    var params = new URLSearchParams(window.location.search);
    var sym = params.get('symbol');
    if (sym) loadToken(sym);
});
