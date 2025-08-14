import { fetchAaveMarkets, fetchAaveMarket, getMarketAddressForChain } from "./marketData";

export async function testMarketData() {
  try {
    console.log("Testing Aave Market Data...");
    
    // Test Ethereum mainnet first
    const ethereumChainId = 1;
    console.log(`Testing market data for Ethereum mainnet (chain ${ethereumChainId})`);
    
    // Get market address
    const marketAddress = getMarketAddressForChain(ethereumChainId);
    console.log("Market address:", marketAddress);
    
    if (!marketAddress) {
      return { success: false, error: "No market address found for Ethereum mainnet" };
    }
    
    // Fetch markets
    const markets = await fetchAaveMarkets(ethereumChainId);
    console.log("Markets found:", markets.length);
    
    if (markets.length === 0) {
      return { success: false, error: "No markets found for Ethereum mainnet" };
    }
    
    // Fetch detailed market info
    const market = await fetchAaveMarket(marketAddress, ethereumChainId);
    console.log("Market details:", market);
    
    if (!market) {
      return { success: false, error: "Failed to fetch market details" };
    }
    
    // Check reserves
    const totalSupplyReserves = market.supplyReserves?.length || 0;
    const totalBorrowReserves = market.borrowReserves?.length || 0;
    const totalReserves = totalSupplyReserves + totalBorrowReserves;
    console.log(`Total reserves: ${totalReserves} (${totalSupplyReserves} supply, ${totalBorrowReserves} borrow)`);
    
    // Show some reserve info
    if (market.supplyReserves && market.supplyReserves.length > 0) {
      const firstReserve = market.supplyReserves[0];
      console.log("Sample supply reserve:", {
        symbol: firstReserve.underlyingToken.symbol,
        address: firstReserve.underlyingToken.address,
        supplyAPY: firstReserve.supplyInfo.apy,
        borrowAPY: firstReserve.borrowInfo?.apy,
        totalSupply: firstReserve.size.amount.value,
        price: firstReserve.usdExchangeRate,
      });
    }
    
    return { 
      success: true, 
      marketCount: markets.length,
      reserveCount: totalReserves,
      marketName: market.name,
      marketAddress: market.address,
    };
    
  } catch (error) {
    console.error("Market data test failed:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}
