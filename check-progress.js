// check-progress.js
const http = require('http');
const fs = require('fs');

function get(url) {
    return new Promise((resolve, reject) => {
        let data = '';
        http.get(url, res => {
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    const db = await get('http://localhost:4001/api/categories?t=' + Date.now());
    console.log('=== Current DB Stats (live, no cache) ===');
    console.log('Total in DB:', db.stats.total);
    console.log('Trusted:   ', db.stats.trusted);
    console.log('Scam:      ', db.stats.scam);
    console.log('Undefined: ', db.stats.undefined);
    console.log('From cache:', db.fromCache);

    try {
        const progress = JSON.parse(fs.readFileSync('./cache/cron-progress.json', 'utf8'));
        console.log('\n=== Cron Progress ===');
        console.log('Analyzed this cycle:', progress.analyzedTokens.length);
        console.log('Last update:', progress.lastUpdate);
    } catch(e) {
        console.log('No cron progress file found');
    }
}

main().catch(console.error);
