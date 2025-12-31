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

### Check Token

```bash
POST /api/check-token
Content-Type: application/json

{
  "contractAddress": "0x...",
  "network": "bsc"
}
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

```bash
curl -X POST http://localhost:3005/api/check-token \
  -H "Content-Type: application/json" \
  -d '{"contractAddress":"0x1234567890abcdef","network":"bsc"}'
```

## License

MIT