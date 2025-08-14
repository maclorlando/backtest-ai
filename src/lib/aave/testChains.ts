import { aaveClient } from "./client";
import { market } from "@aave/client/actions";
import { chainId, evmAddress } from "@aave/client";

// Test different market addresses for mainnets only
const TEST_MARKETS = [
  {
    name: "Ethereum V3",
    chainId: 1,
    address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  },
  {
    name: "Base V3",
    chainId: 8453,
    address: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
  },
  {
    name: "Arbitrum V3",
    chainId: 42161,
    address: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  },
];

export async function testAllChains() {
  console.log("Testing Aave SDK with different chains...");
  
  const results = [];
  
  for (const testMarket of TEST_MARKETS) {
    try {
      console.log(`\nTesting ${testMarket.name} (Chain ${testMarket.chainId})...`);
      
      const result = await market(aaveClient, {
        address: evmAddress(testMarket.address),
        chainId: chainId(testMarket.chainId),
      });

      if (result.isErr()) {
        console.log(`❌ ${testMarket.name}: Error - ${result.error}`);
        results.push({
          name: testMarket.name,
          chainId: testMarket.chainId,
          address: testMarket.address,
          success: false,
          error: result.error,
        });
      } else {
        const marketData = result.value;
        if (marketData) {
          console.log(`✅ ${testMarket.name}: Success`);
          console.log(`   Market: ${marketData.name}`);
          console.log(`   Supply Reserves: ${marketData.supplyReserves?.length || 0}`);
          console.log(`   Borrow Reserves: ${marketData.borrowReserves?.length || 0}`);
          
          results.push({
            name: testMarket.name,
            chainId: testMarket.chainId,
            address: testMarket.address,
            success: true,
            marketData: {
              name: marketData.name,
              supplyReserves: marketData.supplyReserves?.length || 0,
              borrowReserves: marketData.borrowReserves?.length || 0,
            },
          });
        } else {
          console.log(`❌ ${testMarket.name}: No market data returned`);
          results.push({
            name: testMarket.name,
            chainId: testMarket.chainId,
            address: testMarket.address,
            success: false,
            error: "No market data returned",
          });
        }
      }
    } catch (error) {
      console.log(`❌ ${testMarket.name}: Exception - ${error}`);
      results.push({
        name: testMarket.name,
        chainId: testMarket.chainId,
        address: testMarket.address,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  console.log("\n=== SUMMARY ===");
  const working = results.filter(r => r.success);
  const failing = results.filter(r => !r.success);
  
  console.log(`✅ Working: ${working.length}`);
  working.forEach(r => {
    const totalReserves = (r.marketData?.supplyReserves || 0) + (r.marketData?.borrowReserves || 0);
    console.log(`   ${r.name} (${r.chainId}): ${totalReserves} reserves`);
  });
  
  console.log(`❌ Failing: ${failing.length}`);
  failing.forEach(r => {
    console.log(`   ${r.name} (${r.chainId}): ${r.error}`);
  });
  
  return results;
}
