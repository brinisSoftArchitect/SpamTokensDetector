// test-holder-parser.js - Test script for holder concentration parser
const axios = require('axios');
const cheerio = require('cheerio');
const { ethers } = require('ethers');

// Test token data (real contracts)
const TEST_TOKENS = [
    {
        symbol: 'USDT',
        network: 'eth',
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7'
    },
    {
        symbol: 'LINK',
        network: 'eth',
        address: '0x514910771af9ca656af840dff83e8264ecf986ca'
    },
    {
        symbol: 'CAKE',
        network: 'bsc',
        address: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82'
    },
    {
        symbol: 'MATIC',
        network: 'polygon',
        address: '0x0000000000000000000000000000000000001010'
    }
];

class HolderConcentrationParser {
    constructor() {
        this.explorerUrls = {
            'bsc': 'https://bscscan.com',
            'eth': 'https://etherscan.io',
            'polygon': 'https://polygonscan.com',
            'arbitrum': 'https://arbiscan.io',
            'base': 'https://basescan.org',
            'optimism': 'https://optimistic.etherscan.io'
        };
        
        // Free AI API endpoints
        this.freeAIEndpoints = [
            {
                name: 'HuggingFace',
                url: 'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
                headers: {},
                format: 'huggingface'
            },
            {
                name: 'Together',
                url: 'https://api.together.xyz/v1/chat/completions',
                model: 'meta-llama/Llama-3-8b-chat-hf',
                format: 'openai'
            }
        ];
        
        this.rpcUrls = {
            'eth': process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
            'bsc': process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
            'polygon': process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
            'arbitrum': process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
            'base': process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            'optimism': process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io'
        };
        
        this.erc20Abi = [
            'function totalSupply() view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
            'function name() view returns (string)'
        ];
    }

    async getTokenInfo(network, address) {
        try {
            console.log(`📡 Fetching token info from blockchain...`);
            const rpcUrl = this.rpcUrls[network];
            if (!rpcUrl) {
                throw new Error(`No RPC URL for network: ${network}`);
            }

            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const contract = new ethers.Contract(address, this.erc20Abi, provider);

            const [totalSupply, decimals, symbol, name] = await Promise.all([
                contract.totalSupply(),
                contract.decimals(),
                contract.symbol(),
                contract.name()
            ]);

            // Convert total supply to human-readable format
            const totalSupplyRaw = totalSupply.toString();
            const decimalsNum = Number(decimals);
            const totalSupplyFormatted = ethers.formatUnits(totalSupply, decimalsNum);

            console.log(`✅ Token info retrieved:`);
            console.log(`   Name: ${name}`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Decimals: ${decimalsNum}`);
            console.log(`   Total Supply (raw): ${totalSupplyRaw}`);
            console.log(`   Total Supply (formatted): ${totalSupplyFormatted}`);
            console.log(`   Total Supply (human): ${parseFloat(totalSupplyFormatted).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

            return {
                success: true,
                name,
                symbol,
                decimals: decimalsNum,
                totalSupply: totalSupplyRaw,
                totalSupplyFormatted: totalSupplyFormatted
            };
        } catch (error) {
            console.error(`❌ Failed to get token info: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    buildHolderUrl(network, address, useChart = false) {
        const baseUrl = this.explorerUrls[network];
        if (!baseUrl) {
            throw new Error(`Unsupported network: ${network}`);
        }
        
        if (useChart) {
            return `${baseUrl}/token/tokenholderchart/${address}`;
        }
        return `${baseUrl}/token/generic-tokenholders2?m=light&a=${address}&s=10000000000000000000&sid=&p=1`;
    }

    async fetchHolderPage(url, retryCount = 0) {
        try {
            console.log(`🌐 Fetching: ${url}`);
            
            // Use existing htmlFetcher service which has better success rate
            if (retryCount >= 1) {
                console.log(`🎭 Using htmlFetcher service for ${url}`);
                try {
                    const htmlFetcher = require('./services/htmlFetcher');
                    const result = await htmlFetcher.fetchHtml(url, {
                        waitForSelector: 'table',
                        waitTime: 3000,
                        timeout: 30000
                    });
                    
                    if (result.success && result.html) {
                        console.log(`✅ htmlFetcher fetched ${result.html.length} bytes`);
                        
                        // Save HTML for debugging
                        const fs = require('fs');
                        const debugPath = `debug-htmlfetcher-${Date.now()}.html`;
                        fs.writeFileSync(debugPath, result.html);
                        console.log(`   📝 Saved to ${debugPath}`);
                        
                        return { success: true, html: result.html, status: 200 };
                    } else {
                        console.error(`   ❌ htmlFetcher failed: ${result.error}`);
                        // Fall through to axios as fallback
                    }
                } catch (error) {
                    console.error(`   ❌ htmlFetcher error: ${error.message}`);
                    // Fall through to axios as fallback
                }
            }
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                }
            });
            
            if (response.status === 403 || response.status === 429) {
                console.log(`⚠️ Got ${response.status}, switching to Puppeteer...`);
                if (retryCount < 2) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.fetchHolderPage(url, retryCount + 1);
                }
            }
            
            return { success: true, html: response.data, status: response.status };
        } catch (error) {
            console.error(`❌ Failed to fetch: ${error.message}`);
            
            if ((error.code === 'ECONNABORTED' || error.response?.status === 403) && retryCount < 2) {
                console.log(`⚠️ ${error.message}, switching to Puppeteer...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.fetchHolderPage(url, retryCount + 1);
            }
            
            return { success: false, error: error.message };
        }
    }

    parseHolderTable(html, totalSupply, decimals, totalSupplyFormatted, isChart = false) {
        try {
            const $ = cheerio.load(html);
            const holders = [];
            let totalPercentage = 0;

            console.log(`\n📊 Parsing holder table (${isChart ? 'chart' : 'standard'} format)...`);
            console.log(`   Total Supply (raw): ${totalSupply}`);
            console.log(`   Total Supply (formatted): ${totalSupplyFormatted}`);
            console.log(`   Decimals: ${decimals}`);

            // Find the table with holder data
            let rowCount = 0;
            $('table tbody tr, table tr').each((index, row) => {
                if (rowCount >= 10) return false; // Only top 10

                const $row = $(row);
                const cells = $row.find('td');

                if (cells.length < 2) return;

                // Extract rank - try different patterns
                let rank = rowCount + 1;
                const rankCell = $(cells[0]);
                const rankText = rankCell.text().trim();
                if (rankText && !isNaN(rankText)) {
                    rank = parseInt(rankText);
                }

                // Extract address - try multiple patterns
                let address = '';
                let label = '';
                
                // Pattern 1: Link in second cell (standard format)
                let addressCell = $(cells[1]);
                let addressLink = addressCell.find('a').first();
                
                if (addressLink.length) {
                    const href = addressLink.attr('href') || '';
                    address = href.split('/').pop()?.split('?')[0] || '';
                    label = addressLink.attr('data-bs-title') || addressLink.attr('title') || addressLink.text().trim() || '';
                } else {
                    // Pattern 2: Text in cell (chart format)
                    const cellText = addressCell.text().trim();
                    // Check if it looks like an address
                    if (cellText.match(/^0x[a-fA-F0-9]{40}$/) || cellText.match(/^0x[a-fA-F0-9]+$/)) {
                        address = cellText;
                    }
                }
                
                // Try to extract label from icon/span if not found
                if (!label) {
                    const iconText = addressCell.find('span[data-bs-title]').attr('data-bs-title') ||
                                   addressCell.find('[title]').attr('title') ||
                                   addressCell.find('i').next().text().trim();
                    if (iconText) label = iconText;
                }

                // Extract quantity/balance - CRITICAL: Get raw number
                let balance = '';
                let balanceRaw = '';
                
                if (cells.length >= 3) {
                    const balanceCell = $(cells[2]);
                    const balanceText = balanceCell.text().trim();
                    
                    // Remove commas and extract first number
                    // Example: "2,912,056,762.194038942722184095" -> "2912056762.194038942722184095"
                    balanceRaw = balanceText.replace(/,/g, '').split(' ')[0];
                    balance = balanceRaw;
                    
                    console.log(`   Row ${rank}: Balance text="${balanceText}" -> parsed="${balance}"`);
                }

                // DON'T extract percentage from HTML - we'll calculate it ourselves
                let percentage = 0;

                // Detect special address types
                const lowerLabel = label.toLowerCase();
                const lowerAddress = address.toLowerCase();
                
                const isExchange = lowerLabel.includes('binance') || 
                                 lowerLabel.includes('coinbase') ||
                                 lowerLabel.includes('kraken') ||
                                 lowerLabel.includes('okex') ||
                                 lowerLabel.includes('huobi') ||
                                 lowerLabel.includes('kucoin') ||
                                 lowerLabel.includes('gate.io') ||
                                 lowerLabel.includes('bybit');

                const isBlackhole = lowerAddress === '0x000000000000000000000000000000000000dead' ||
                                  lowerAddress === '0x0000000000000000000000000000000000000000' ||
                                  lowerAddress.includes('0x00000000000000000000000000000000000dead') ||
                                  lowerLabel.includes('burn') ||
                                  lowerLabel.includes('black hole') ||
                                  lowerLabel.includes('null');

                const isContract = lowerLabel.includes('contract') ||
                                 lowerLabel.includes('pool') ||
                                 lowerLabel.includes('vault') ||
                                 lowerLabel.includes('staking');

                let type = 'Regular';
                if (isBlackhole) type = 'Blackhole';
                else if (isExchange) type = 'Exchange';
                else if (isContract) type = 'Contract';

                // Valid holder if we have address
                if (address && address.length > 10) {
                    // ALWAYS calculate percentage from balance, never trust HTML percentage
                    if (balance && totalSupplyFormatted) {
                        try {
                            // Both balance and totalSupplyFormatted are in human-readable token units
                            const balanceNum = parseFloat(balance);
                            const supplyNum = parseFloat(totalSupplyFormatted);
                            
                            if (!isNaN(balanceNum) && !isNaN(supplyNum) && supplyNum > 0) {
                                percentage = (balanceNum / supplyNum) * 100;
                                console.log(`   ✅ Rank ${rank}: ${balanceNum.toLocaleString()} / ${supplyNum.toLocaleString()} = ${percentage.toFixed(4)}%`);
                            } else {
                                console.log(`   ⚠️ Invalid numbers for rank ${rank}: balance=${balanceNum}, supply=${supplyNum}`);
                            }
                        } catch (e) {
                            console.log(`   ❌ Error calculating percentage for rank ${rank}: ${e.message}`);
                        }
                    }
                    
                    holders.push({
                        rank,
                        address,
                        balance,
                        percentage: parseFloat(percentage.toFixed(4)),
                        label: label || 'Unknown',
                        isExchange,
                        isBlackhole,
                        isContract,
                        type
                    });
                    
                    // Only count non-blackhole addresses in total percentage
                    if (!isBlackhole) {
                        totalPercentage += percentage;
                    } else {
                        console.log(`   🔥 Rank ${rank} is BLACKHOLE - excluding from total percentage`);
                    }
                    rowCount++;
                }
            });

            if (holders.length === 0) {
                console.log(`❌ No holders found. Dumping table structure...`);
                console.log(`   Tables found: ${$('table').length}`);
                $('table').first().find('tr').each((i, row) => {
                    const cells = $(row).find('td, th');
                    console.log(`   Row ${i}: ${cells.length} cells - ${$(row).text().trim().substring(0, 100)}`);
                });
                return { success: false, error: 'No holders found in table' };
            }

            console.log(`✅ Found ${holders.length} holders`);
            console.log(`   Top 10 total: ${totalPercentage.toFixed(4)}%`);

            // Display all holders with their details
            console.log(`\n👥 Holder Details:`);
            holders.forEach(h => {
                const icon = h.isBlackhole ? '🔥' : h.isExchange ? '🏦' : h.isContract ? '📜' : '👤';
                console.log(`   ${icon} #${h.rank}: ${h.label}`);
                console.log(`      Address: ${h.address}`);
                console.log(`      Balance: ${parseFloat(h.balance).toLocaleString()}`);
                console.log(`      Percentage: ${h.percentage}%`);
                console.log(`      Type: ${h.type}`);
            });

            // Analyze concentration (excluding blackholes)
            const top1 = holders[0];
            const top10Percentage = totalPercentage; // Already excludes blackholes
            const nonBlackholeHolders = holders.filter(h => !h.isBlackhole);
            const top1NonBlackhole = nonBlackholeHolders[0];

            let concentrationLevel = 'LOW';
            let rugPullRisk = false;

            if (top1NonBlackhole && top1NonBlackhole.percentage > 50 && !top1NonBlackhole.isExchange) {
                concentrationLevel = 'CRITICAL';
                rugPullRisk = true;
            } else if (top1NonBlackhole && top1NonBlackhole.percentage > 30 && !top1NonBlackhole.isExchange) {
                concentrationLevel = 'HIGH';
                rugPullRisk = true;
            } else if (top10Percentage > 80) {
                concentrationLevel = 'HIGH';
            } else if (top10Percentage > 60) {
                concentrationLevel = 'MODERATE';
            }

            console.log(`\n📈 Concentration Analysis (excluding blackholes):`);
            console.log(`   Top holder: ${top1NonBlackhole ? top1NonBlackhole.label : 'N/A'}`);
            console.log(`   Top 1 %: ${top1NonBlackhole ? top1NonBlackhole.percentage : 0}%`);
            console.log(`   Top 10 %: ${top10Percentage.toFixed(4)}%`);

            return {
                success: true,
                holderConcentration: {
                    top1Percentage: top1NonBlackhole ? top1NonBlackhole.percentage : 0,
                    top1Address: top1NonBlackhole ? top1NonBlackhole.address : '',
                    top1Label: top1NonBlackhole ? top1NonBlackhole.label : '',
                    top1IsExchange: top1NonBlackhole ? top1NonBlackhole.isExchange : false,
                    top1IsBlackhole: false,
                    top1Type: top1NonBlackhole ? top1NonBlackhole.type : '',
                    top10Percentage: parseFloat(top10Percentage.toFixed(4)),
                    top10PercentageIncludingBlackholes: parseFloat(holders.reduce((sum, h) => sum + h.percentage, 0).toFixed(4)),
                    rugPullRisk,
                    concentrationLevel,
                    top10Holders: holders,
                    blackholeCount: holders.filter(h => h.isBlackhole).length,
                    blackholePercentage: parseFloat(holders.filter(h => h.isBlackhole).reduce((sum, h) => sum + h.percentage, 0).toFixed(4))
                }
            };
        } catch (error) {
            console.error(`❌ Parse error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async analyzeToken(token) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔍 Analyzing ${token.symbol} on ${token.network}`);
        console.log(`   Address: ${token.address}`);
        console.log(`${'='.repeat(80)}`);

        try {
            // Get real token info from blockchain
            const tokenInfo = await this.getTokenInfo(token.network, token.address);
            if (!tokenInfo.success) {
                return {
                    symbol: token.symbol,
                    network: token.network,
                    success: false,
                    error: `Failed to get token info: ${tokenInfo.error}`
                };
            }

            // Try standard URL first
            let url = this.buildHolderUrl(token.network, token.address, false);
            let fetchResult = await this.fetchHolderPage(url);
            let isChart = false;

            // If standard fails or returns 403, try chart URL
            if (!fetchResult.success || fetchResult.status === 403 || fetchResult.status === 429) {
                console.log(`⚠️ Standard URL failed, trying chart URL...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                url = this.buildHolderUrl(token.network, token.address, true);
                fetchResult = await this.fetchHolderPage(url);
                isChart = true;
            }

            if (!fetchResult.success) {
                return {
                    symbol: tokenInfo.symbol,
                    network: token.network,
                    success: false,
                    error: fetchResult.error
                };
            }

            const parseResult = this.parseHolderTable(
                fetchResult.html,
                tokenInfo.totalSupply,
                tokenInfo.decimals,
                tokenInfo.totalSupplyFormatted,
                isChart
            );

            if (!parseResult.success) {
                return {
                    symbol: tokenInfo.symbol,
                    network: token.network,
                    success: false,
                    error: parseResult.error
                };
            }

            return {
                symbol: tokenInfo.symbol,
                name: tokenInfo.name,
                network: token.network,
                address: token.address,
                decimals: tokenInfo.decimals,
                totalSupply: tokenInfo.totalSupply,
                success: true,
                ...parseResult
            };
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            return {
                symbol: token.symbol,
                network: token.network,
                success: false,
                error: error.message
            };
        }
    }
}

// Run tests
async function runTests() {
    console.log('🚀 Starting Holder Concentration Parser Tests');
    console.log(`Testing ${TEST_TOKENS.length} tokens...\n`);

    const parser = new HolderConcentrationParser();
    const results = [];

    for (const token of TEST_TOKENS) {
        const result = await parser.analyzeToken(token);
        results.push(result);

        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 TEST SUMMARY');
    console.log(`${'='.repeat(80)}`);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`❌ Failed: ${failed.length}/${results.length}`);

    successful.forEach(r => {
        console.log(`\n${r.symbol} (${r.network}):`);
        console.log(`  Top 1: ${r.holderConcentration.top1Percentage}% - ${r.holderConcentration.top1Label}`);
        console.log(`  Top 10: ${r.holderConcentration.top10Percentage}%`);
        console.log(`  Risk: ${r.holderConcentration.concentrationLevel}`);
        console.log(`  Rug Pull Risk: ${r.holderConcentration.rugPullRisk}`);
    });

    if (failed.length > 0) {
        console.log(`\n❌ Failed tokens:`);
        failed.forEach(r => {
            console.log(`  ${r.symbol} (${r.network}): ${r.error}`);
        });
    }

    // Save results
    const fs = require('fs');
    fs.writeFileSync(
        'test-results/holder-parser-results.json',
        JSON.stringify(results, null, 2)
    );
    console.log(`\n💾 Results saved to test-results/holder-parser-results.json`);
}

runTests().catch(console.error);