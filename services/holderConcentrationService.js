// services/holderConcentrationService.js - Reusable holder concentration analysis service
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { ethers } = require('ethers');

class HolderConcentrationService {
    constructor() {
        this.explorerUrls = {
            'eth': 'https://etherscan.io',
            'bsc': 'https://bscscan.com',
            'polygon': 'https://polygonscan.com',
            'arbitrum': 'https://arbiscan.io',
            'optimism': 'https://optimistic.etherscan.io',
            'avalanche': 'https://snowtrace.io',
            'base': 'https://basescan.org',
            'fantom': 'https://ftmscan.com',
            'cronos': 'https://cronoscan.com',
            'moonbeam': 'https://moonscan.io',
            'moonriver': 'https://moonriver.moonscan.io',
            'celo': 'https://celoscan.io'
        };
        
        this.rpcUrls = {
            'eth': 'https://eth.llamarpc.com',
            'bsc': 'https://bsc-dataseed1.binance.org',
            'polygon': 'https://polygon-rpc.com',
            'arbitrum': 'https://arb1.arbitrum.io/rpc',
            'optimism': 'https://mainnet.optimism.io',
            'avalanche': 'https://api.avax.network/ext/bc/C/rpc',
            'base': 'https://mainnet.base.org',
            'fantom': 'https://rpc.ftm.tools',
            'cronos': 'https://evm.cronos.org',
            'moonbeam': 'https://rpc.api.moonbeam.network',
            'moonriver': 'https://rpc.api.moonriver.moonbeam.network',
            'celo': 'https://forno.celo.org'
        };
        
        this.erc20Abi = [
            'function totalSupply() view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
            'function name() view returns (string)'
        ];
    }

    /**
     * Main entry point - Analyzes token holder concentration
     * @param {Object} params - { network, address, symbol (optional) }
     * @returns {Object} - Complete analysis result
     */
    async analyzeHolderConcentration(params) {
        const { network, address, symbol } = params;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔍 HOLDER CONCENTRATION ANALYSIS`);
        console.log(`   Network: ${network}`);
        console.log(`   Address: ${address}`);
        console.log(`   Symbol: ${symbol || 'Unknown'}`);
        console.log(`${'='.repeat(80)}`);

        try {
            // Step 1: Get token info from blockchain
            let tokenInfo = await this.getTokenInfo(network, address);
            
            // Step 2: Try to fetch holder page
            const url = this.buildHolderUrl(network, address, false);
            let fetchResult = await this.fetchHolderPage(url);
            let isChart = false;

            // Step 3: If standard fails, try chart URL
            if (!fetchResult.success || fetchResult.status === 403 || fetchResult.status === 429) {
                console.log(`⚠️ Standard URL failed, trying chart URL...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const chartUrl = this.buildHolderUrl(network, address, true);
                fetchResult = await this.fetchHolderPage(chartUrl);
                isChart = true;
            }

            if (!fetchResult.success) {
                return {
                    success: false,
                    error: 'Failed to fetch holder page',
                    details: fetchResult.error
                };
            }

            // Step 4: Try AI parsing for comprehensive data extraction
            if (!tokenInfo.success || fetchResult.html.includes('Cloudflare')) {
                console.log(`\n🤖 Attempting AI-powered extraction...`);
                const aiHtmlParser = require('./aiHtmlParser');
                const aiResult = await aiHtmlParser.parseTokenPage(
                    url,
                    fetchResult.html,
                    network,
                    address
                );
                
                if (aiResult.success) {
                    return {
                        success: true,
                        method: 'AI',
                        ...aiResult
                    };
                }
                
                console.log(`⚠️ AI parsing failed, falling back to manual parsing`);
            }

            // Step 5: Manual parsing fallback
            if (!tokenInfo.success && tokenInfo.shouldExtractFromPage) {
                tokenInfo = this.extractTokenInfoFromHtml(fetchResult.html);
            }

            if (!tokenInfo.success) {
                return {
                    success: false,
                    error: 'Failed to get token info',
                    details: tokenInfo.error
                };
            }

            // Step 6: Parse holder table manually
            const parseResult = this.parseHolderTable(
                fetchResult.html,
                tokenInfo.totalSupply,
                tokenInfo.decimals,
                tokenInfo.totalSupplyFormatted,
                isChart
            );

            if (!parseResult.success) {
                return {
                    success: false,
                    error: 'Failed to parse holder table',
                    details: parseResult.error
                };
            }

            return {
                success: true,
                method: 'Manual',
                tokenInfo: {
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    contractAddress: address,
                    totalSupply: tokenInfo.totalSupply,
                    decimals: tokenInfo.decimals,
                    tokenType: `ERC-20 (${network.toUpperCase()})`
                },
                holderConcentration: parseResult.holderConcentration,
                network,
                address
            };

        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                network,
                address
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

    async getTokenInfo(network, address) {
        try {
            console.log(`📡 Fetching token info from blockchain...`);
            const rpcUrl = this.rpcUrls[network];
            if (!rpcUrl) {
                console.log(`⚠️ No RPC URL for ${network}, will extract from explorer page`);
                return {
                    success: false,
                    error: `No RPC URL for network: ${network}`,
                    shouldExtractFromPage: true
                };
            }

            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const contract = new ethers.Contract(address, this.erc20Abi, provider);

            const [totalSupply, decimals, symbol, name] = await Promise.all([
                contract.totalSupply(),
                contract.decimals(),
                contract.symbol(),
                contract.name()
            ]);

            const totalSupplyRaw = totalSupply.toString();
            const decimalsNum = Number(decimals);
            const totalSupplyFormatted = ethers.formatUnits(totalSupply, decimalsNum);

            console.log(`✅ Token info retrieved from RPC:`);
            console.log(`   Name: ${name}`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Decimals: ${decimalsNum}`);
            console.log(`   Total Supply: ${parseFloat(totalSupplyFormatted).toLocaleString()}`);

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
                error: error.message,
                shouldExtractFromPage: true
            };
        }
    }

    async fetchHolderPage(url, retryCount = 0) {
        try {
            console.log(`🌐 Fetching: ${url}`);
            
            // Use stealth puppeteer for Cloudflare-protected sites
            if (retryCount >= 1) {
                console.log(`🎭 Using Puppeteer with stealth...`);
                try {
                    const puppeteerExtra = require('puppeteer-extra');
                    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
                    puppeteerExtra.use(StealthPlugin());
                    
                    const browser = await puppeteerExtra.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    });
                    
                    const page = await browser.newPage();
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(5000);
                    
                    const content = await page.content();
                    await browser.close();
                    
                    return { success: true, html: content, status: 200 };
                } catch (error) {
                    console.error(`   ❌ Puppeteer error: ${error.message}`);
                    return { success: false, error: error.message };
                }
            }
            
            // Standard HTTP request
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 30000
                };
                
                const req = protocol.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, data: data }));
                });
                
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                
                req.end();
            });

            if (response.status === 403 || response.status === 429) {
                if (retryCount < 1) {
                    console.log(`⚠️ Got ${response.status}, retrying with stealth...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.fetchHolderPage(url, retryCount + 1);
                }
            }
            
            return { success: true, html: response.data, status: response.status };

        } catch (error) {
            console.error(`❌ Failed to fetch: ${error.message}`);
            
            if (retryCount < 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.fetchHolderPage(url, retryCount + 1);
            }
            
            return { success: false, error: error.message };
        }
    }

    extractTokenInfoFromHtml(html) {
        try {
            const $ = cheerio.load(html);
            
            let name = '';
            let symbol = '';
            let decimals = 18;
            let totalSupply = '';
            
            const pageTitle = $('title').text();
            const titleMatch = pageTitle.match(/(.+?)\s*\((.+?)\)\s*Token/);
            if (titleMatch) {
                name = titleMatch[1].trim();
                symbol = titleMatch[2].trim();
            }
            
            $('body').find('*').each((i, elem) => {
                const text = $(elem).text();
                
                if (text.includes('Total Supply')) {
                    const supplyMatch = text.match(/([\d,]+\.?\d*)\s*Token/i);
                    if (supplyMatch) {
                        totalSupply = supplyMatch[1].replace(/,/g, '');
                    }
                }
                
                if (text.includes('Decimals')) {
                    const decimalsMatch = text.match(/Decimals?:\s*(\d+)/i);
                    if (decimalsMatch) {
                        decimals = parseInt(decimalsMatch[1]);
                    }
                }
            });
            
            if (totalSupply) {
                return {
                    success: true,
                    name: name || 'Unknown',
                    symbol: symbol || 'Unknown',
                    decimals: decimals,
                    totalSupply: (parseFloat(totalSupply) * Math.pow(10, decimals)).toString(),
                    totalSupplyFormatted: totalSupply
                };
            }
            
            return { success: false, error: 'Could not extract from page' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    parseHolderTable(html, totalSupply, decimals, totalSupplyFormatted, isChart = false) {
        try {
            const $ = cheerio.load(html);
            const holders = [];
            let totalPercentage = 0;

            console.log(`\n📊 Parsing holder table...`);

            let rowCount = 0;
            $('table tbody tr, table tr').each((index, row) => {
                if (rowCount >= 10) return false;

                const $row = $(row);
                const cells = $row.find('td');
                if (cells.length < 2) return;

                const rank = rowCount + 1;
                let address = '';
                let label = '';
                
                const addressCell = $(cells[1]);
                const addressLink = addressCell.find('a').first();
                
                if (addressLink.length) {
                    // Extract address from href (the actual holder address)
                    const href = addressLink.attr('href') || '';
                    const hrefMatch = href.match(/\/address\/(0x[a-fA-F0-9]{40})/);
                    
                    if (hrefMatch) {
                        address = hrefMatch[1].toLowerCase();
                    } else {
                        // Fallback: try to get from href path
                        const hrefParts = href.split('/');
                        const possibleAddress = hrefParts[hrefParts.length - 1];
                        if (possibleAddress && possibleAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
                            address = possibleAddress.toLowerCase();
                        } else {
                            // Last fallback: get from link text
                            const linkText = addressLink.text().trim();
                            const textMatch = linkText.match(/0x[a-fA-F0-9]+/);
                            if (textMatch) {
                                address = textMatch[0].toLowerCase();
                            }
                        }
                    }
                    
                    // Get label from tooltip or text
                    const tooltip = addressLink.attr('data-bs-title') || addressLink.attr('title') || '';
                    if (tooltip && tooltip.includes(':')) {
                        label = tooltip.split(':')[0].trim();
                    } else {
                        label = addressLink.text().trim() || 'Unknown';
                    }
                }

                let balance = '';
                if (cells.length >= 3) {
                    const balanceCell = $(cells[2]);
                    balance = balanceCell.text().trim().replace(/,/g, '').split(' ')[0];
                }

                let percentage = 0;
                if (balance && totalSupplyFormatted) {
                    const balanceNum = parseFloat(balance);
                    const supplyNum = parseFloat(totalSupplyFormatted);
                    if (!isNaN(balanceNum) && supplyNum > 0) {
                        percentage = (balanceNum / supplyNum) * 100;
                    }
                }

                const lowerLabel = label.toLowerCase();
                const lowerAddress = address.toLowerCase();
                
                const isExchange = lowerLabel.includes('binance') || lowerLabel.includes('coinbase');
                const isBlackhole = lowerAddress === '0x000000000000000000000000000000000000dead' || 
                                  lowerAddress === '0x0000000000000000000000000000000000000000';
                const isContract = lowerLabel.includes('contract') || lowerLabel.includes('pool');

                let type = 'Regular';
                if (isBlackhole) type = 'Blackhole';
                else if (isExchange) type = 'Exchange';
                else if (isContract) type = 'Contract';

                if (address && address.length > 10) {
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
                    
                    if (!isBlackhole) {
                        totalPercentage += percentage;
                    }
                    rowCount++;
                }
            });

            if (holders.length === 0) {
                return { success: false, error: 'No holders found' };
            }

            const nonBlackholeHolders = holders.filter(h => !h.isBlackhole);
            const top1 = nonBlackholeHolders[0];

            let concentrationLevel = 'LOW';
            let rugPullRisk = false;

            console.log(`\n📈 Concentration Analysis (excluding blackholes):`);
            console.log(`   Top holder: ${top1 ? top1.label : 'N/A'}`);
            console.log(`   Top 1 %: ${top1 ? top1.percentage : 0}%`);
            console.log(`   Top 10 %: ${totalPercentage.toFixed(4)}%`);

            if (top1 && top1.percentage > 50 && !top1.isExchange) {
                concentrationLevel = 'CRITICAL';
                rugPullRisk = true;
            } else if (top1 && top1.percentage > 30 && !top1.isExchange) {
                concentrationLevel = 'HIGH';
                rugPullRisk = true;
            } else if (totalPercentage > 80) {
                concentrationLevel = 'HIGH';
            } else if (totalPercentage > 60) {
                concentrationLevel = 'MODERATE';
            }

            // Calculate total including blackholes for comparison
            const totalPercentageIncludingBlackholes = parseFloat(
                holders.reduce((sum, h) => sum + h.percentage, 0).toFixed(4)
            );

            return {
                success: true,
                holderConcentration: {
                    top1Percentage: top1 ? top1.percentage : 0,
                    top1Address: top1 ? top1.address : '',
                    top1Label: top1 ? top1.label : '',
                    top1IsExchange: top1 ? top1.isExchange : false,
                    top1IsBlackhole: false,
                    top1Type: top1 ? top1.type : '',
                    top10Percentage: parseFloat(totalPercentage.toFixed(4)),
                    top10PercentageIncludingBlackholes: totalPercentageIncludingBlackholes,
                    rugPullRisk,
                    concentrationLevel,
                    top10Holders: holders,
                    blackholeCount: holders.filter(h => h.isBlackhole).length,
                    blackholePercentage: parseFloat(
                        holders.filter(h => h.isBlackhole).reduce((sum, h) => sum + h.percentage, 0).toFixed(4)
                    ),
                    // Detailed breakdown for cron usage
                    holdersBreakdown: {
                        total: holders.length,
                        regular: holders.filter(h => h.type === 'Regular').length,
                        exchanges: holders.filter(h => h.type === 'Exchange').length,
                        contracts: holders.filter(h => h.type === 'Contract').length,
                        blackholes: holders.filter(h => h.type === 'Blackhole').length
                    }
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new HolderConcentrationService();