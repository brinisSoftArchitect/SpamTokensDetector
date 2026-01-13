// services/aiHtmlParser.js - AI fallback for complex blockchain pages
const axios = require('axios');

class AIHtmlParser {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    async parseTokenPage(url, html, network, symbol) {
        try {
            console.log(`🤖 Using AI fallback parser for ${symbol} on ${network}`);

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
  "holders": [
    {
      "rank": 1,
      "address": "string",
      "balance": "string",
      "percentage": 59.5537
    }
  ],
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
                model: 'anthropic/claude-3.5-sonnet',
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
