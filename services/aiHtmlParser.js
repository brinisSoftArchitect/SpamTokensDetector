// services/aiHtmlParser.js - AI fallback for complex blockchain pages
const axios = require('axios');

class AIHtmlParser {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    async parseTokenPageFromUrl(url, network, contractAddress) {
        try {
            console.log(`🤖 Fetching HTML from ${url} for AI parsing`);
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
                console.error(`❌ Failed to fetch HTML: ${fetchResult.error}`);
                return {
                    success: false,
                    error: 'Failed to fetch HTML',
                    details: fetchResult.error
                };
            }
            
            const html = fetchResult.html;
            console.log(`✅ HTML fetched successfully, length: ${html.length}`);
            
            return await this.parseTokenPage(url, html, network, contractAddress);
            
        } catch (error) {
            console.error(`❌ Failed to fetch HTML from ${url}:`, error.message);
            return {
                success: false,
                error: 'Failed to fetch HTML',
                details: error.message
            };
        }
    }

    async parseTokenPage(url, html, network, contractAddress) {
        try {
            console.log(`🤖 Using AI parser for contract ${contractAddress} on ${network}`);
            
            // Check if OPENROUTER_API_KEY is set
            if (!this.apiKey) {
                console.log('⚠️ OPENROUTER_API_KEY not set, AI parsing unavailable');
                return {
                    success: false,
                    error: 'AI parsing unavailable - API key not configured'
                };
            }

            const prompt = `Analyze this blockchain explorer page and extract token holder information with PRECISE percentage values.

URL: ${url}
Network: ${network}
Symbol: ${symbol}

HTML (first 40000 chars):
${html.substring(0, 40000)}

IMPORTANT: Extract the EXACT percentage values as shown in the table. DO NOT round them.
For example, if the HTML shows "59.5537%", extract 59.5537, NOT 59 or 60.

Extract and return ONLY a valid JSON object (no markdown, no explanation):
{
  "success": true,
  "tokenInfo": {
    "name": "string",
    "symbol": "string",
    "contractAddress": "string or null",
    "totalSupply": "string",
    "decimals": "number",
    "tokenType": "string (BRC-20, ERC-20, etc)"
  },
   "holderConcentration": {
          "top1Percentage": 26.9434,
          "top1Address": "0x4c64ce7c270e1316692067771bbb0dce6ec69b7c",
          "top1Label": "Gelato Network: Gelato DAO",
          "top1IsExchange": false,
          "top1IsBlackhole": false,
          "top1Type": "Regular",
          "top10Percentage": 69.2898,
          "rugPullRisk": false,
          "concentrationLevel": "MODERATE",
          "top10Holders": [
            {
              "rank": 1,
              "address": "0x4c64ce7c270e1316692067771bbb0dce6ec69b7c",
              "balance": "113348137.196614688531363707",
              "percentage": 26.9434,
              "label": "Gelato Network: Gelato DAO",
              "isExchange": false,
              "isBlackhole": false,
              "isContract": false,
              "type": "Regular"
            },
            {
              "rank": 2,
              "address": "0x55Fa2DabDA34f2AcaC9AC69e3DbEc6CbABfa4416",
              "balance": "29057859.681",
              "percentage": 6.9072,
              "label": "Smart Account by Safe",
              "isExchange": false,
              "isBlackhole": false,
              "isContract": false,
              "type": "Regular"
            },
            {
              "rank": 3,...
  "deploymentInfo": {
    "deployer": "string",
    "deployTime": "string"
  },
  "marketData": {
    "marketCap": "string",
    "volume24h": "string",
    "currentPrice": "string"
  }
}`;

            const response = await axios.post(this.baseUrl, {
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            const responseText = response.data.choices[0].message.content.trim();
            console.log(`🤖 AI response for ${symbol}:`, responseText);
            let jsonText = responseText;
            if (jsonText.includes('```json')) {
                jsonText = jsonText.split('```json')[1].split('```')[0].trim();
            } else if (jsonText.includes('```')) {
                jsonText = jsonText.split('```')[1].split('```')[0].trim();
            }

            const parsedData = JSON.parse(jsonText);
            console.log(`✅ AI successfully parsed ${symbol}`);
            
            return parsedData;

        } catch (error) {
            console.error(`❌ AI parsing failed for ${symbol}:`, error.message);
            return {
                success: false,
                error: 'AI parsing failed',
                details: error.message
            };
        }
    }
}

module.exports = new AIHtmlParser();
