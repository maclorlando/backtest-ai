# SagaFi

**"From Aave Base Markets to Multi-Chain Portfolio Management — and Beyond"**

SagaFi is a non-custodial platform for testing and managing DeFi portfolios. Our MVP focuses on Aave Base markets with a roadmap to expand across multiple chains and eventually integrate real-world credit.

## 🎯 Project Overview

SagaFi provides a layered platform that starts with Aave Base markets and expands outward:

- **Analytics Layer**: Backtesting historical strategies and forward-testing with asset price assumptions
- **Execution Layer**: One-click Aave Base market portfolio deployment with smart contract batching
- **Vault Layer**: ERC-4626 compliant Aave Meta Vaults (future)
- **Lifestyle Layer**: Credit card linked to SagaFi for real-world spending (future)

## 🚀 Current Features (MVP)

- **Portfolio Backtesting**: Test crypto investment strategies with historical data
- **Wallet Integration**: EVM wallet support with ERC-20 token tracking
- **Aave Integration**: DeFi lending and borrowing on supported networks
- **Settings Management**: Alchemy API integration for pricing data

## 📋 Pages

- `/` - Portfolio Backtester & Analysis
- `/aave` - DeFi Lending & Borrowing
- `/settings` - Configuration & Preferences
- `/wallet` - Wallet Management
- `/roadmap` - Project Roadmap & Vision

## 🛠️ Technology Stack

- **Frontend**: Next.js, React, WalletConnect/RainbowKit
- **Analytics Engine**: Alchemy APIs, custom back/forward testing
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

## 🔧 Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Alchemy API**:
   - Get an API key from [Alchemy](https://www.alchemy.com/)
   - Create a `.env.local` file in the project root
   - Add your API key (backend only - never exposed to frontend):
     ```
     ALCHEMY_API_KEY=your_alchemy_api_key_here
     ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

See [ALCHEMY_SETUP.md](./ALCHEMY_SETUP.md) for detailed setup instructions.

## 🔑 API Configuration

SagaFi uses Alchemy API for price data. To enable enhanced features and higher rate limits:

1. Get a free API key from [Alchemy](https://www.alchemy.com/)
2. Add the API key to your `.env.local` file as `ALCHEMY_API_KEY` (backend only)
3. For production, add `ALCHEMY_API_KEY` to your Vercel environment variables
4. Restart your development server

The app requires an API key to function. With an Alchemy API key, you get:
- Access to historical price data
- Real-time price information
- Reliable backtesting and portfolio analysis

## 📈 Roadmap

See `/roadmap` for detailed 5-phase development plan from MVP to DeFi-powered neobank.

## 🔒 Security

- Non-custodial: Assets remain in the user's wallet
- Standards-based: ERC-4337 + ERC-4626 compliance
- Focus on EVM testnets initially, mainnets enabled with proper configuration
