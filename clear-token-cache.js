// clear-token-cache.js - clears contract cache for a specific symbol
const mongoose = require('mongoose');
require('dotenv').config();

async function clear(symbol) {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const db = process.env.MONGO_DB || 'spamTokenDetector';
    await mongoose.connect(uri);
    const conn = mongoose.connection.useDb(db);
    
    // Clear contract cache
    try {
        const r1 = await conn.collection('contractcaches').deleteOne({ symbol: symbol.toUpperCase() });
        console.log('ContractCache deleted:', r1.deletedCount);
    } catch(e) { console.log('contractcaches:', e.message); }
    
    // Clear token analysis cache so it re-analyzes
    try {
        const r2 = await conn.collection('tokenanalysis').deleteOne({ symbol: symbol.toUpperCase() });
        console.log('TokenAnalysis deleted:', r2.deletedCount);
    } catch(e) { console.log('tokenanalysis:', e.message); }

    // Clear file cache
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const filePath = path.join(os.homedir(), 'antiscam', 'cache', 'tokens', symbol.toUpperCase() + '.json');
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); console.log('File cache deleted:', filePath); }
    
    await mongoose.disconnect();
    console.log('Done! Now reload the token page.');
}

const sym = process.argv[2];
if (!sym) { console.log('Usage: node clear-token-cache.js TAKE'); process.exit(1); }
clear(sym).catch(console.error);
