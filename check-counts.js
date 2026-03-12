// check-counts.js
const http = require('http');
const https = require('https');

function get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        let data = '';
        lib.get(url, res => {
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    const db = await get('http://localhost:4001/api/categories');
    console.log('=== DB Stats ===');
    console.log('Total in DB:', db.stats.total);
    console.log('Trusted:', db.stats.trusted);
    console.log('Scam:', db.stats.scam);
    console.log('Undefined:', db.stats.undefined);

    const pairs = await get('https://api.gateio.ws/api/v4/spot/currency_pairs');
    const usdt = pairs.filter(p => p.quote && p.quote.toUpperCase() === 'USDT' && p.trade_status === 'tradable');
    const symbols = [...new Set(usdt.map(p => p.base.toUpperCase()))];
    console.log('\n=== Gate.io Stats ===');
    console.log('USDT tradable pairs:', usdt.length);
    console.log('Unique base symbols:', symbols.length);
    console.log('Missing from DB:', symbols.filter(s => !db.lists.trusted.includes(s) && !db.lists.scam.includes(s) && !db.lists.undefined.includes(s)).length);
}

main().catch(console.error);
