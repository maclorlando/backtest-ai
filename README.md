Backtest AI – Crypto Portfolio Backtester (Next.js + TypeScript)

## Prerequisites

- Node.js 18+
- A CoinGecko API key set as an environment variable. Create a `.env.local` file in the project root and add:

```
COINGECKO_API_KEY=your_key_here
```

Notes:
- The key is read only on the server side. We do not expose it to the client.
- We attribute “Price data by CoinGecko” in the UI per their attribution guide.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

You can start editing the dashboard by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Features

- Build custom crypto portfolios with allocations
- Historical price fetching via CoinGecko (server-side)
- Optional fallbacks for resilience
- Rebalancing options: none, periodic, threshold
- Metrics: cumulative return, CAGR, max drawdown, volatility, Sharpe
- Responsive chart with invested baseline

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
