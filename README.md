# DeBank (DeFi Bank)

**"From Aave Base Markets to Multi-Chain Portfolio Management — and Beyond"**

DeBank is a non-custodial platform for testing and managing DeFi portfolios. Our MVP focuses on Aave Base markets with a roadmap to expand across multiple chains and eventually integrate real-world credit.

## 🎯 Project Overview

DeBank provides a layered platform that starts with Aave Base markets and expands outward:

- **Analytics Layer**: Backtesting historical strategies and forward-testing with asset price assumptions
- **Execution Layer**: One-click Aave Base market portfolio deployment with smart contract batching
- **Vault Layer**: ERC-4626 compliant Aave Meta Vaults (future)
- **Lifestyle Layer**: Credit card linked to DeBank for real-world spending (future)

## 🚀 Current Features (MVP)

- **Portfolio Backtesting**: Test crypto investment strategies with historical data
- **Wallet Integration**: EVM wallet support with ERC-20 token tracking
- **Aave Integration**: DeFi lending and borrowing on supported networks
- **Settings Management**: User-configurable CoinGecko API integration for pricing data

## 📋 Pages

- `/` - Portfolio Backtester & Analysis
- `/aave` - DeFi Lending & Borrowing
- `/settings` - Configuration & Preferences
- `/wallet` - Wallet Management
- `/roadmap` - Project Roadmap & Vision

## 🛠️ Technology Stack

- **Frontend**: Next.js, React, WalletConnect/RainbowKit
- **Analytics Engine**: CoinGecko APIs, custom back/forward testing
- **Smart Contracts**: Aave Base market interactions
- **Integrations**: Aave Base markets (MVP), roadmap includes Hyperliquid, Kamino, Cetus

## 🎯 Target Audience

- **Retail/Independent Investors**: Start with Aave Base market strategies
- **Advanced Users**: Access to LP strategies (cbBTC/WBTC, JupSOL/SOL)
- **Institutional Investors**: ERC-4626 vault wrappers & reporting (roadmap)
- **Everyday Users**: Credit cards linked to DeFi yield (Phase 5)

## 🚀 Development

```bash
npm run dev    # Start development server
npm run test   # Run unit tests
```

## 🔑 API Configuration

DeBank uses CoinGecko API for price data. To enable enhanced features and higher rate limits:

1. Get a free API key from [CoinGecko](https://www.coingecko.com/en/api)
2. Go to `/settings` in the app
3. Enter your API key in the "CoinGecko API Key" field
4. Save settings

The app works without an API key but with limited rate limits. With an API key, you get:
- Higher rate limits for price fetching
- Access to premium CoinGecko features
- Better reliability for backtesting and portfolio analysis

## 📈 Roadmap

See `/roadmap` for detailed 5-phase development plan from MVP to DeFi-powered neobank.

## 🔒 Security

- Non-custodial: Assets remain in the user's wallet
- Standards-based: ERC-4337 + ERC-4626 compliance
- Focus on EVM testnets initially, mainnets enabled with proper configuration
