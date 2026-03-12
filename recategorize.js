// recategorize.js - Re-categorizes all tokens in DB based on current risk thresholds
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGO_DB || 'spamTokenDetector';
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection('tokenAnalysis');

    const tokens = await col.find({}).toArray();
    console.log(`Found ${tokens.length} tokens to recategorize...`);

    let trusted = 0, scam = 0, undef = 0, updated = 0;

    for (const token of tokens) {
        const risk = token.riskPercentage;
        const shouldSkip = token.shouldSkip || false;

        let newCategory;
        if (risk === undefined || risk === null || isNaN(risk)) {
            newCategory = 'undefined';
            undef++;
        } else if (shouldSkip || risk >= 50) {
            newCategory = 'scam';
            scam++;
        } else {
            newCategory = 'trusted';
            trusted++;
        }

        if (newCategory !== token.category) {
            await col.updateOne({ _id: token._id }, { $set: { category: newCategory } });
            console.log(`  ${token.symbol}: ${token.category} → ${newCategory} (risk: ${risk}%, shouldSkip: ${shouldSkip})`);
            updated++;
        }
    }

    console.log(`\n✅ Done! Updated ${updated} tokens`);
    console.log(`   Trusted: ${trusted}`);
    console.log(`   Scam: ${scam}`);
    console.log(`   Undefined: ${undef}`);
    await client.close();
}

run().catch(console.error);
