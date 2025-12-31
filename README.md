# Spam Token Detector API

API service to detect spam/scam cryptocurrency tokens by analyzing ownership distribution, exchange listings, and blockchain data.

## Features

- Multi-source data aggregation (CoinMarketCap, CoinGecko, Blockchain Scanners)
- Ownership concentration analysis
- Exchange listing verification
- AI-powered spam explanation
- Spam score calculation (0-100)
- Support for multiple networks (BSC, ETH, Polygon, Arbitrum, Avalanche)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and add your API keys (optional):

```bash
cp .env.example .env
```

The system works without API keys but will use mock data for blockchain information.

## Usage

Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### Check Token (POST)

```bash
POST /api/check-token
Content-Type: application/json

{
  "contractAddress": "0x...",
  "network": "bsc"
}
```

### Check Token (GET)

```bash
GET /api/check-token/{network}/{contractAddress}

Example:
GET /api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8
```

### Get Examples

```bash
GET /api/examples
```

**Response:**

```json
{
  "isSpam": true,
  "spamScore": 75,
  "token": {
    "name": "Token Name",
    "symbol": "TKN",
    "contractAddress": "0x...",
    "network": "bsc"
  },
  "exchanges": ["PancakeSwap"],
  "ownershipAnalysis": {
    "topOwnerPercentage": 85.5,
    "topOwnerAddress": "0x...",
    "isExchange": false,
    "concentrated": true,
    "top10Percentage": 97.4
  },
  "aiExplanation": "High concentration risk: Top wallet holds 85.5% of supply...",
  "dataSources": {
    "coinMarketCap": true,
    "coinGecko": true,
    "blockchain": true
  }
}
```

## Supported Networks

- `bsc` - Binance Smart Chain
- `eth` - Ethereum
- `polygon` - Polygon
- `arbitrum` - Arbitrum One
- `avalanche` - Avalanche C-Chain

## Spam Detection Criteria

- **Ownership Concentration**: High percentage held by single wallet
- **Exchange Listings**: Lack of major exchange presence
- **Verification Status**: Unverified tokens
- **Market Cap**: Very low market capitalization
- **Top 10 Holders**: Excessive concentration

## Testing

### Quick Browser Test

Just open in your browser:

```
http://localhost:3005/api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8
```

### GET Request Examples

```bash
# Test WETH on BSC (Legitimate Token)
curl http://localhost:3005/api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8

# Test BUSD on BSC (Legitimate Token)
curl http://localhost:3005/api/check-token/bsc/0xe9e7cea3dedca5984780bafc599bd69add087d56

# Test CAKE on BSC (Legitimate Token)
curl http://localhost:3005/api/check-token/bsc/0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82

# Test USDT on Ethereum
curl http://localhost:3005/api/check-token/eth/0xdac17f958d2ee523a2206206994597c13d831ec7

# Get all examples
curl http://localhost:3005/api/examples
```

### POST Request Example

```bash
curl -X POST http://localhost:3005/api/check-token \
  -H "Content-Type: application/json" \
  -d '{"contractAddress":"0x2170ed0880ac9a755fd29b2688956bd959f933f8","network":"bsc"}'
```

### Browser Testing

1. Start the server: `npm start`
2. Open browser and navigate to:
   - Main API info: http://localhost:3005/
   - Examples list: http://localhost:3005/api/examples
   - Test token: http://localhost:3005/api/check-token/bsc/0x2170ed0880ac9a755fd29b2688956bd959f933f8

## License

MIT