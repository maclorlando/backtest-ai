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
- **Settings Management**: CoinGecko API integration for pricing data

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

## 📈 Roadmap

See `/roadmap` for detailed 5-phase development plan from MVP to DeFi-powered neobank.

## 🔒 Security

- Non-custodial: Assets remain in the user's wallet
- Standards-based: ERC-4337 + ERC-4626 compliance
- Focus on EVM testnets initially, mainnets enabled with proper configuration
