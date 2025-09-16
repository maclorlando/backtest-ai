# Alchemy API Setup

This project now uses Alchemy's Prices API instead of CoinGecko for fetching cryptocurrency price data.

## Setup Instructions

1. **Get an Alchemy API Key**
   - Visit [Alchemy](https://www.alchemy.com/)
   - Sign up for a free account
   - Create a new app or use an existing one
   - Copy your API key

2. **Set Environment Variable (Backend Only)**
   For local development, create a `.env.local` file in the project root and add:
   ```
   ALCHEMY_API_KEY=your_alchemy_api_key_here
   ```
   
   For production deployment (Vercel), add the environment variable in your Vercel dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add `ALCHEMY_API_KEY` with your Alchemy API key

3. **Test the Integration**
   Start your development server and test the backtesting functionality:
   ```bash
   npm run dev
   ```

## API Architecture

The integration uses a secure backend API approach:
- **Frontend**: Calls `/api/alchemy/prices` (our secure backend endpoint)
- **Backend**: Makes requests to Alchemy's API with the secure API key
- **Alchemy Endpoint**: `https://api.g.alchemy.com/prices/v1/{apiKey}/tokens/historical`
- **Method**: POST
- **Documentation**: https://www.alchemy.com/docs/data/prices-api/prices-api-endpoints/prices-api-endpoints/get-historical-token-prices

### Security Benefits
- ✅ API key is never exposed to the frontend
- ✅ All Alchemy API calls are made from the secure backend
- ✅ Rate limiting and error handling on the server side
- ✅ Chunked data fetching handled securely on the backend

## Supported Tokens

The following tokens are supported (mapped from AssetId to symbol):
- `bitcoin` → `BTC`
- `ethereum` → `ETH`
- `solana` → `SOL`
- `usd-coin` → `USDC`
- `tether` → `USDT`
- `pepe` → `PEPE`
- `polkadot` → `DOT`
- `aave` → `AAVE`
- `chainlink` → `LINK`
- `fartcoin` → `FART`
- `wrapped-staked-ether` → `wstETH`
- `euro-coin` → `EURC`

## Historical Data Coverage

Alchemy's Prices API provides extensive historical data coverage with intelligent chunked fetching:
- **Default Range**: 3 years (for better statistical significance)
- **Available Presets**: 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y
- **Maximum Range**: Up to 10 years (fetched in 365-day chunks)
- **Data Granularity**: Daily price points
- **Chunked Fetching**: Automatically handles API's 365-day/365-point limitation
- **Coverage**: Major tokens typically have 5-10+ years of historical data

### Chunked Data Fetching

The integration automatically handles Alchemy's 365-day/365-data-point limitation by:
1. **Splitting long date ranges** into 365-day chunks
2. **Fetching each chunk sequentially** to avoid API limits
3. **Consolidating and deduplicating** the results
4. **Providing seamless experience** for multi-year backtests

## Migration Notes

- CoinGecko-specific rate limiting has been removed
- API key is now securely managed on the backend (never exposed to frontend)
- All existing price fetching functions maintain the same interface for backward compatibility
- CoinGecko-specific functions (logos, market data, etc.) are now placeholder functions that throw errors
- Frontend now calls secure backend API instead of making direct Alchemy requests

## Troubleshooting

If you encounter issues:

1. **"ALCHEMY_API_KEY environment variable is required on the server"**
   - Make sure you've set the environment variable in `.env.local` (local) or Vercel dashboard (production)
   - Restart your development server after adding the environment variable
   - Ensure the variable name is `ALCHEMY_API_KEY` (not `NEXT_PUBLIC_ALCHEMY_API_KEY`)

2. **Backend API errors**
   - Check the server console logs for detailed error messages
   - Verify your Alchemy API key is correct
   - Check that your Alchemy account has access to the Prices API
   - Ensure you're not exceeding rate limits

3. **No price data returned**
   - Check that the token symbol is supported
   - Verify the date range is valid
   - Check the backend API logs for chunked fetching progress
   - Ensure the backend API endpoint is accessible
