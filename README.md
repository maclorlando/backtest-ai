# Backtest AI — Crypto Portfolio Backtester

This app lets you compose and backtest crypto portfolios. It now includes:

- Wallet (EVM, Sepolia-first): create/recover (password-encrypted), track ERC-20 tokens, view balances in USD (for known assets)
- Settings: save a CoinGecko API key used by pricing utilities
- Aave Manager (foundation): validate a saved portfolio against Aave v3 on supported Sepolia networks and supply USDC according to allocation. Non-USDC assets require swap integration (future).

Notes
- Focus is on EVM Sepolia testnets. Mainnets can be enabled later by adding chain configs.
- Pricing uses CoinGecko (optionally with your key). Set in Settings page.

Pages
- `/` Backtester
- `/wallet` Wallet
- `/settings` Settings
- `/aave` Aave Manager

Dev
- `npm run dev` to start
- `npm run test` to run unit tests (limited)
