import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { getAaveConfig } from "./config";

// Simple ABI for price oracle
const PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getAssetPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function testPriceOracle() {
  try {
    console.log("Testing Aave Price Oracle on Base Sepolia...");
    
    const config = getAaveConfig(84532); // Base Sepolia
    if (!config) {
      throw new Error("No Aave config found for Base Sepolia");
    }

    console.log("Price Oracle address:", config.priceOracle);
    console.log("Available assets:", Object.keys(config.reserves));

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http("https://sepolia.base.org", {
        timeout: 10000,
        retryCount: 3,
        retryDelay: 1000,
      }),
    });

    // Test with WETH
    const wethAddress = config.reserves["WETH"]?.underlying;
    if (wethAddress) {
      console.log("Testing WETH price...");
      const price = await publicClient.readContract({
        address: config.priceOracle as any,
        abi: PRICE_ORACLE_ABI,
        functionName: "getAssetPrice",
        args: [wethAddress as any],
      });
      
      const priceInUSD = Number(price) / 1e8;
      console.log(`WETH price: $${priceInUSD}`);
      return { success: true, price: priceInUSD };
    }

    return { success: false, error: "WETH not found in config" };
  } catch (error) {
    console.error("Price oracle test failed:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
