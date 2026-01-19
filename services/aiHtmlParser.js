// services/aiHtmlParser.js - AI fallback for complex blockchain pages
const https = require('https');
const http = require('http');

class AIHtmlParser {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    async parseTokenPageFromUrl(url, network, contractAddress) {
        try {
            console.log(`\n🌐 AI PARSER - FETCHING HTML`);
            console.log(`   URL: ${url}`);
            console.log(`   Network: ${network}`);
            console.log(`   Contract: ${contractAddress}`);
            
            // Use htmlFetcher for better success rate
            const htmlFetcher = require('./htmlFetcher');
            const fetchResult = await htmlFetcher.fetchHtml(url, {
                waitForSelector: 'tbody',
                waitTime: 3000,
                timeout: 30000
            });
            
            if (!fetchResult.success) {
                console.error(`\n❌ FAILED TO FETCH HTML:`);
                console.error(`   Error: ${fetchResult.error}`);
                return {
                    success: false,
                    error: 'Failed to fetch HTML',
                    details: fetchResult.error
                };
            }
            
            const html = fetchResult.html;
            console.log(`\n✅ HTML FETCHED SUCCESSFULLY`);
            console.log(`   Length: ${html.length} bytes`);
            console.log(`   Proceeding to AI parsing...\n`);
            
            return await this.parseTokenPage(url, html, network, contractAddress);
            
        } catch (error) {
            console.error(`\n❌ AI PARSER - FETCH ERROR:`);
            console.error(`   URL: ${url}`);
            console.error(`   Error: ${error.message}`);
            return {
                success: false,
                error: 'Failed to fetch HTML',
                details: error.message
            };
        }
    }

    async parseTokenPage(url, html, network, contractAddress) {
        try {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🤖 AI HTML PARSER - COMPREHENSIVE DATA EXTRACTION`);
            console.log(`   Network: ${network}`);
            console.log(`   Contract: ${contractAddress}`);
            console.log(`   URL: ${url}`);
            console.log(`   HTML Length: ${html.length} bytes`);
            console.log(`${'='.repeat(80)}\n`);
            
            // Check if OPENROUTER_API_KEY is set
            if (!this.apiKey) {
                console.log('⚠️ OPENROUTER_API_KEY not set, AI parsing unavailable');
                return {
                    success: false,
                    error: 'AI parsing unavailable - API key not configured'
                };
            }
            
            console.log(`✅ API Key configured, proceeding with AI parsing...`);

            // Extract symbol from URL or use contract address as fallback
            let symbolForPrompt = 'Unknown';
            try {
                const urlMatch = url.match(/\/token\/([^#?]+)/);
                if (urlMatch) {
                    symbolForPrompt = urlMatch[1].substring(0, 10);
                }
            } catch (e) {
                symbolForPrompt = contractAddress.substring(0, 10);
            }

            const prompt = `Analyze this blockchain explorer page and extract token holder information with PRECISE percentage values.

URL: ${url}
Network: ${network}
Contract Address: ${contractAddress}

HTML (first 40000 chars):
${html.substring(0, 40000)}

CRITICAL INSTRUCTIONS:
1. Extract EXACT percentage values from the HTML table - DO NOT calculate, just read what's displayed
2. For balances with commas like "263,874,624.5221", include the full number
3. If any field is not found, use reasonable defaults (don't leave as null)
4. Return ONLY valid JSON, no markdown blocks

Extract and return this JSON structure:
{
  "success": true,
  "tokenInfo": {
    "name": "Token Name from page title or header",
    "symbol": "TOKEN_SYMBOL",
    "contractAddress": "0x...",
    "totalSupply": "1000000000",
    "decimals": 18,
    "tokenType": "ERC-20"
  },
  "holderConcentration": {
    "top1Percentage": 26.3875,
    "top1Address": "0x3b3c632df85e98185291270baa02ae1b76662a20",
    "top1Label": "Holder Name or Unknown",
    "top1IsExchange": false,
    "top1IsBlackhole": false,
    "top1Type": "Regular",
    "top10Percentage": 92.0154,
    "rugPullRisk": true,
    "concentrationLevel": "VERY_HIGH",
    "top10Holders": [
      {
        "rank": 1,
        "address": "0x3b3c632df85e98185291270baa02ae1b76662a20",
        "balance": "263874624.5221",
        "percentage": 26.3875,
        "label": "Unknown",
        "isExchange": false,
        "isBlackhole": false,
        "isContract": false,
        "type": "Regular"
      }
    ]
  },
  "deploymentInfo": {
    "deployer": "0x... or Unknown",
    "deployTime": "Date or Unknown"
  },
  "marketData": {
    "marketCap": "$0 or Unknown",
    "volume24h": "$0 or Unknown",
    "currentPrice": "$0 or Unknown"
  }
}

REMEMBER: 
- Read percentages directly from HTML (e.g., "26.3875%" → 26.3875)
- Include full balance numbers (e.g., "263,874,624.5221" → "263874624.5221")
- Extract at least top 10 holders with their exact data`;

            const postData = JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const response = await new Promise((resolve, reject) => {
                const urlObj = new URL(this.baseUrl);
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 30000
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve({ data: JSON.parse(data) });
                        } catch (e) {
                            reject(new Error(`Failed to parse response: ${e.message}`));
                        }
                    });
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.write(postData);
                req.end();
            });

            const responseText = response.data.choices[0].message.content.trim();
            console.log(`\n📥 AI RAW RESPONSE (first 500 chars):`);
            console.log(responseText.substring(0, 500) + '...');
            console.log(`\n`);
            
            let jsonText = responseText;
            if (jsonText.includes('```json')) {
                console.log(`🔧 Extracting JSON from markdown code block...`);
                jsonText = jsonText.split('```json')[1].split('```')[0].trim();
            } else if (jsonText.includes('```')) {
                console.log(`🔧 Extracting JSON from code block...`);
                jsonText = jsonText.split('```')[1].split('```')[0].trim();
            }

            console.log(`\n🔍 Parsing JSON response...`);
            const parsedData = JSON.parse(jsonText);
            
            console.log(`\n✅ AI SUCCESSFULLY PARSED TOKEN DATA:`);
            console.log(`   Token: ${parsedData.tokenInfo?.name} (${parsedData.tokenInfo?.symbol})`);
            console.log(`   Total Supply: ${parsedData.tokenInfo?.totalSupply}`);
            console.log(`   Decimals: ${parsedData.tokenInfo?.decimals}`);
            console.log(`   Token Type: ${parsedData.tokenInfo?.tokenType}`);
            
            if (parsedData.holderConcentration) {
                console.log(`\n📊 HOLDER CONCENTRATION:`);
                console.log(`   Top 1: ${parsedData.holderConcentration.top1Percentage}% - ${parsedData.holderConcentration.top1Label}`);
                console.log(`   Top 10: ${parsedData.holderConcentration.top10Percentage}%`);
                console.log(`   Concentration Level: ${parsedData.holderConcentration.concentrationLevel}`);
                console.log(`   Rug Pull Risk: ${parsedData.holderConcentration.rugPullRisk}`);
                console.log(`   Holders Count: ${parsedData.holderConcentration.top10Holders?.length || 0}`);
            }
            
            if (parsedData.deploymentInfo) {
                console.log(`\n🚀 DEPLOYMENT INFO:`);
                console.log(`   Deployer: ${parsedData.deploymentInfo.deployer}`);
                console.log(`   Deploy Time: ${parsedData.deploymentInfo.deployTime}`);
            }
            
            if (parsedData.marketData) {
                console.log(`\n💰 MARKET DATA:`);
                console.log(`   Market Cap: ${parsedData.marketData.marketCap}`);
                console.log(`   24h Volume: ${parsedData.marketData.volume24h}`);
                console.log(`   Current Price: ${parsedData.marketData.currentPrice}`);
            }
            
            console.log(`\n${'='.repeat(80)}\n`);
            
            return parsedData;

        } catch (error) {
            console.error(`\n❌ AI PARSING FAILED:`);
            console.error(`   Error: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
            console.log(`\n${'='.repeat(80)}\n`);
            
            return {
                success: false,
                error: 'AI parsing failed',
                details: error.message
            };
        }
    }

    async callHuggingFaceAPI(prompt) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 2000,
                    temperature: 0.1,
                    return_full_text: false
                }
            });

            const options = {
                hostname: 'api-inference.huggingface.co',
                path: '/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 60000
            };

            console.log(`   📡 Calling HuggingFace API...`);
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`   ✅ HuggingFace API responded`);
                        
                        // HuggingFace returns array with generated_text
                        if (parsed[0] && parsed[0].generated_text) {
                            resolve({ 
                                data: { 
                                    choices: [{ 
                                        message: { 
                                            content: parsed[0].generated_text 
                                        } 
                                    }] 
                                } 
                            });
                        } else if (parsed.error) {
                            reject(new Error(`HuggingFace API error: ${parsed.error}`));
                        } else {
                            reject(new Error('Unexpected HuggingFace API response format'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse HuggingFace response: ${e.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error(`   ❌ HuggingFace API request failed: ${err.message}`);
                reject(err);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('HuggingFace API timeout'));
            });

            req.write(postData);
            req.end();
        });
    }
}

module.exports = new AIHtmlParser();
