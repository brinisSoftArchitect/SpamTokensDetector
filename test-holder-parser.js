// test-holder-parser.js - Test script for holder concentration analysis
const holderConcentrationService = require('./services/holderConcentrationService');

// Top 12 blockchain networks by token count on Gate.io
const TEST_TOKENS = [
    {
        symbol: 'USDT',
        network: 'eth',
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        explorer: 'Etherscan'
    },
    {
        symbol: 'CAKE',
        network: 'bsc',
        address: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
        explorer: 'BscScan'
    },
    {
        symbol: 'ARB',
        network: 'arbitrum',
        address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
        explorer: 'Arbiscan'
    },
    {
        symbol: 'OP',
        network: 'optimism',
        address: '0x4200000000000000000000000000000000000042',
        explorer: 'Optimistic Etherscan'
    },
    {
        symbol: 'USDC',
        network: 'base',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        explorer: 'BaseScan'
    },
    {
        symbol: 'LINK',
        network: 'eth',
        address: '0x514910771af9ca656af840dff83e8264ecf986ca',
        explorer: 'Etherscan'
    }
];

// Test runner for holder concentration analysis
async function runTests() {
    console.log('🚀 Starting Holder Concentration Analysis Tests');
    console.log(`Testing ${TEST_TOKENS.length} tokens...\n`);

    const results = [];

    for (const token of TEST_TOKENS) {
        const result = await holderConcentrationService.analyzeHolderConcentration({
            network: token.network,
            address: token.address,
            symbol: token.symbol
        });
        
        results.push({
            ...result,
            symbol: token.symbol,
            explorer: token.explorer
        });
console.log(`✅ Tested ${token.symbol} on ${token.network}`,result,result.holderConcentration.top10Holders[0]);
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Summary
    printSummary(results);

    // Save results
    const fs = require('fs');
    fs.writeFileSync(
        'test-results/holder-parser-results.json',
        JSON.stringify(results, null, 2)
    );
    console.log(`\n💾 Results saved to test-results/holder-parser-results.json`);
}

function printSummary(results) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 TEST SUMMARY');
    console.log(`${'='.repeat(80)}`);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`❌ Failed: ${failed.length}/${results.length}`);

    successful.forEach(r => {
        const methodIndicator = r.method === 'AI' ? '🤖 [AI]' : '🔧 [MANUAL]';
        console.log(`\n${methodIndicator} ${r.symbol} (${r.network.toUpperCase()}) - ${r.explorer}:`);
        console.log(`  Name: ${r.tokenInfo.name}`);
        console.log(`  Top 1: ${r.holderConcentration.top1Percentage}% - ${r.holderConcentration.top1Label}`);
        console.log(`  Top 10: ${r.holderConcentration.top10Percentage}%`);
        if (r.holderConcentration.blackholePercentage) {
            console.log(`  Blackhole: ${r.holderConcentration.blackholePercentage}%`);
        }
        console.log(`  Risk: ${r.holderConcentration.concentrationLevel}`);
        console.log(`  Rug Pull Risk: ${r.holderConcentration.rugPullRisk ? '⚠️ YES' : '✅ NO'}`);
        
        // Display top 10 holders
        if (r.holderConcentration.top10Holders && r.holderConcentration.top10Holders.length > 0) {
            console.log(`\n  📊 Top 10 Holders:`);
            r.holderConcentration.top10Holders.forEach(h => {
                const icon = h.isBlackhole ? '🔥' : h.isExchange ? '🏦' : h.isContract ? '📜' : '👤';
                console.log(`    ${icon} #${h.rank}: ${h.label}`);
                console.log(`       ${h.address}`);
                console.log(`       ${h.percentage}% (${parseFloat(h.balance).toLocaleString()} tokens)`);
            });
        }
    });

    if (failed.length > 0) {
        console.log(`\n❌ Failed tokens:`);
        failed.forEach(r => {
            console.log(`  ${r.symbol} (${r.network}): ${r.error}`);
        });
    }
}

runTests().catch(console.error);