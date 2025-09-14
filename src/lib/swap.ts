import { Address, WalletClient, parseUnits, formatUnits, createPublicClient, http, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { showErrorNotification, showSuccessNotification, showInfoNotification } from "@/lib/utils/errorHandling";
import { getAaveConfig } from "@/lib/aave/config";
import { getParaSwapConfig, isParaSwapConfigured } from "@/lib/aave/swapConfig";

// Base network token addresses
const TOKEN_ADDRESSES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, // Correct cbBTC address on Base
  WETH: "0x4200000000000000000000000000000000000006" as Address,
  wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" as Address,
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as Address,
  AAVE: "0x63706e401c06ac8513145b7687A14804d17f814b" as Address,
} as const;

// ERC20 ABI for token operations
const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Fetch token info from ParaSwap to get correct decimals
async function fetchTokenInfo(tokenAddress: Address, chainId: number = 8453): Promise<{
  decimals: number;
  symbol: string;
} | null> {
  try {
    const url = `https://apiv5.paraswap.io/tokens/${chainId}`;
    console.log(`Fetching token info for ${tokenAddress} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const tokenInfo = data.tokens?.find((token: any) => 
        token.address.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (tokenInfo) {
        console.log(`Found token info for ${tokenAddress}:`, tokenInfo);
        return {
          decimals: tokenInfo.decimals,
          symbol: tokenInfo.symbol
        };
      } else {
        console.warn(`Token ${tokenAddress} not found in ParaSwap curated token list`);
        console.log(`Note: ParaSwap API supports tokens not in their curated list. Using hardcoded values.`);
        return null;
      }
    } else {
      console.warn(`Failed to fetch token list: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.warn(`Error fetching token info for ${tokenAddress}:`, error);
    return null;
  }
}

// Test ParaSwap connectivity
export async function testParaSwapAPI(chainId: number = 8453): Promise<{
  isWorking: boolean;
  error?: string;
}> {
  try {
    // Check if ParaSwap is configured
    if (!isParaSwapConfigured(chainId)) {
      return {
        isWorking: false,
        error: "ParaSwap is not configured for this chain. Please set NEXT_PUBLIC_PARASWAP_AUGUSTUS_BASE environment variable."
      };
    }

    // Try to get token info from ParaSwap, but don't fail if tokens aren't in curated list
    console.log('Testing ParaSwap API connectivity...');
    const usdcInfo = await fetchTokenInfo(TOKEN_ADDRESSES.USDC, chainId);
    const cbBTCInfo = await fetchTokenInfo(TOKEN_ADDRESSES.cbBTC, chainId);
    
    // Use hardcoded values if ParaSwap doesn't have the token info
    const usdcDecimals = usdcInfo?.decimals || getTokenDecimals(TOKEN_ADDRESSES.USDC);
    const cbBTCDecimals = cbBTCInfo?.decimals || getTokenDecimals(TOKEN_ADDRESSES.cbBTC);
    
    console.log(`Using token info: USDC (${usdcDecimals} decimals), cbBTC (${cbBTCDecimals} decimals)`);
    
    // Test with a small amount to see if ParaSwap can provide a quote
    const testAmount = parseUnits("1", usdcDecimals);
    const testUrl = `https://apiv5.paraswap.io/prices/?srcToken=${TOKEN_ADDRESSES.USDC}&destToken=${TOKEN_ADDRESSES.cbBTC}&amount=${testAmount.toString()}&srcDecimals=${usdcDecimals}&destDecimals=${cbBTCDecimals}&side=SELL&network=${chainId}&userAddress=0x0000000000000000000000000000000000000000&partner=paraswap`;
    
    console.log(`Testing ParaSwap API connectivity: ${testUrl}`);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.priceRoute) {
        console.log('✅ ParaSwap API is working and can provide quotes for USDC->cbBTC');
        return { isWorking: true };
      } else {
        return {
          isWorking: false,
          error: "ParaSwap API returned invalid response format - no price route found"
        };
      }
    } else {
      const errorText = await response.text();
      return {
        isWorking: false,
        error: `ParaSwap API returned ${response.status}: ${response.statusText} - ${errorText}`
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ ParaSwap API test failed:', error);
    return {
      isWorking: false,
      error: `ParaSwap API test failed: ${errorMsg}`
    };
  }
}

// Get token decimals dynamically
function getTokenDecimals(tokenAddress: Address): number {
  const tokenAddressLower = tokenAddress.toLowerCase();
  
  // USDC on Base
  if (tokenAddressLower === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") {
    return 6;
  }
  // cbBTC on Base
  if (tokenAddressLower === "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf") {
    return 8;
  }
  // WETH on Base
  if (tokenAddressLower === "0x4200000000000000000000000000000000000006") {
    return 18;
  }
  // wstETH on Base
  if (tokenAddressLower === "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452") {
    return 18;
  }
  // EURC on Base
  if (tokenAddressLower === "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42") {
    return 6;
  }
  // AAVE on Base
  if (tokenAddressLower === "0x63706e401c06ac8513145b7687a14804d17f814b") {
    return 18;
  }
  
  // Default fallback
  console.warn(`Unknown token decimals for ${tokenAddress}, using default 18`);
  return 18;
}

// ParaSwap API for getting swap quotes
async function getParaSwapQuote(
  fromToken: Address,
  toToken: Address,
  amount: string,
  fromAddress: Address,
  chainId: number = 8453
): Promise<{
  toAmount: string;
  data: `0x${string}`;
  to: Address;
  tokenTransferProxy: Address;
}> {
  // Try to get token info from ParaSwap first, fallback to hardcoded values
  const fromTokenInfo = await fetchTokenInfo(fromToken, chainId);
  const toTokenInfo = await fetchTokenInfo(toToken, chainId);
  
  const fromDecimals = fromTokenInfo?.decimals || getTokenDecimals(fromToken);
  const toDecimals = toTokenInfo?.decimals || getTokenDecimals(toToken);
  
  console.log(`Token info: ${fromTokenInfo ? 'ParaSwap' : 'hardcoded'} (${fromDecimals} decimals) -> ${toTokenInfo ? 'ParaSwap' : 'hardcoded'} (${toDecimals} decimals)`);
  const amountWei = parseUnits(amount, fromDecimals);
  
  console.log(`=== ParaSwap Quote Request ===`);
  console.log(`From Token: ${fromToken} (${fromDecimals} decimals) ${fromTokenInfo ? `[from ParaSwap]` : `[hardcoded]`}`);
  console.log(`To Token: ${toToken} (${toDecimals} decimals) ${toTokenInfo ? `[from ParaSwap]` : `[hardcoded]`}`);
  console.log(`Amount: ${amount} (${amountWei.toString()} wei)`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`User Address: ${fromAddress}`);
  
  // Step 1: Get price quote
  const priceUrl = `https://apiv5.paraswap.io/prices/?srcToken=${fromToken}&destToken=${toToken}&amount=${amountWei.toString()}&srcDecimals=${fromDecimals}&destDecimals=${toDecimals}&side=SELL&network=${chainId}&userAddress=${fromAddress}&partner=paraswap`;
  
  console.log(`Fetching ParaSwap price quote from: ${priceUrl}`);
  
  try {
    const priceResponse = await fetch(priceUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!priceResponse.ok) {
      const errorText = await priceResponse.text();
      console.error(`ParaSwap price API error: ${priceResponse.status} ${priceResponse.statusText}`, errorText);
      console.error(`Request URL: ${priceUrl}`);
      console.error(`Request parameters:`, {
        srcToken: fromToken,
        destToken: toToken,
        amount: amountWei.toString(),
        srcDecimals: fromDecimals,
        destDecimals: toDecimals,
        side: 'SELL',
        network: chainId,
        userAddress: fromAddress
      });
      throw new Error(`Failed to get ParaSwap price quote: ${priceResponse.status} ${priceResponse.statusText} - ${errorText}`);
    }
    
    const priceData = await priceResponse.json();
    console.log('ParaSwap price quote received:', JSON.stringify(priceData, null, 2));
    
    // Get the best price route
    const bestRoute = priceData.priceRoute;
    if (!bestRoute) {
      console.error('Available fields in price response:', Object.keys(priceData));
      throw new Error('No price route found in ParaSwap response');
    }
    
    console.log('Best route:', JSON.stringify(bestRoute, null, 2));
    
    const destAmount = bestRoute.destAmount;
    if (!destAmount) {
      throw new Error('No destination amount found in ParaSwap response');
    }
    
    // Step 2: Get transaction data
    const txUrl = `https://apiv5.paraswap.io/transactions/${chainId}?ignoreChecks=true`;
    
    const txPayload = {
      srcToken: fromToken,
      destToken: toToken,
      srcAmount: amountWei.toString(),
      priceRoute: bestRoute,
      slippage: 100, // 1% slippage
      userAddress: fromAddress,
      partner: 'paraswap',
      partnerAddress: '0x0000000000000000000000000000000000000000',
      partnerFeeBps: 0,
      srcDecimals: fromDecimals,
      destDecimals: toDecimals,
    };
    
    console.log(`Fetching ParaSwap transaction data from: ${txUrl}`);
    console.log('Transaction payload:', JSON.stringify(txPayload, null, 2));
    
    const txResponse = await fetch(txUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(txPayload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!txResponse.ok) {
      const errorText = await txResponse.text();
      console.error(`ParaSwap transaction API error: ${txResponse.status} ${txResponse.statusText}`, errorText);
      throw new Error(`Failed to get ParaSwap transaction data: ${txResponse.status} ${txResponse.statusText}`);
    }
    
    const txData = await txResponse.json();
    console.log('ParaSwap transaction data received:', JSON.stringify(txData, null, 2));
    
    // Get the swap call data from transaction response
    const swapCallData = txData.data;
    
    if (!swapCallData) {
      console.error('Available fields in transaction response:', Object.keys(txData));
      throw new Error('No transaction data found in ParaSwap response');
    }
    
    if (typeof swapCallData !== 'string' || !swapCallData.startsWith('0x')) {
      throw new Error(`Invalid swap call data format: ${swapCallData}`);
    }
    
    return {
      toAmount: destAmount,
      data: swapCallData as `0x${string}`,
      to: txData.to as Address,
      tokenTransferProxy: bestRoute.tokenTransferProxy as Address,
    };
  } catch (error) {
    console.error('ParaSwap API fetch error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ParaSwap quote request timed out. Please try again.');
    }
    throw new Error(`Failed to fetch ParaSwap quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get current gas price for Base network
async function getCurrentGasPrice(publicClient: ReturnType<typeof createPublicClient>): Promise<bigint> {
  try {
    const gasPrice = await publicClient.getGasPrice();
    // Use a slightly higher gas price for faster confirmation
    return (gasPrice * BigInt(110)) / BigInt(100); // 10% higher than base gas price
  } catch (error) {
    console.warn("Failed to get current gas price, using fallback:", error);
    // Fallback gas price for Base network (0.001 gwei)
    return parseUnits("0.001", 9); // 0.001 gwei
  }
}

// Get token balance
export async function getTokenBalance(
  tokenAddress: Address,
  userAddress: Address,
  decimals: number = 6
): Promise<string> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return formatUnits(balance, decimals);
}

// Execute token swap using ParaSwap
// Multi-swap function for batching multiple swaps in one transaction
export async function multiSwapTokens(
  walletClient: WalletClient,
  swaps: Array<{
    fromToken: Address;
    toToken: Address;
    amount: string;
    slippage?: number;
  }>,
  slippage: number = 1
): Promise<string> {
  try {
    const account = walletClient.account;
    if (!account) {
      throw new Error("Wallet account not available");
    }

    console.log(`=== Starting ParaSwap multi-swap ===`);
    console.log(`Number of swaps: ${swaps.length}`);
    swaps.forEach((swap, index) => {
      console.log(`Swap ${index + 1}: ${swap.amount} tokens from ${swap.fromToken} to ${swap.toToken}`);
    });

    showInfoNotification(
      `Getting ParaSwap multi-swap quote for ${swaps.length} swaps...`,
      "ParaSwap Multi-Swap Started"
    );

    // For now, we'll implement this as sequential swaps
    // TODO: Implement actual ParaSwap multi-swap API call
    const results: string[] = [];
    
    for (let i = 0; i < swaps.length; i++) {
      const swap = swaps[i];
      console.log(`Executing swap ${i + 1}/${swaps.length}: ${swap.amount} tokens`);
      
      const hash = await swapTokens(
        walletClient,
        swap.fromToken,
        swap.toToken,
        swap.amount,
        swap.slippage || slippage
      );
      
      results.push(hash);
      
      // Add a small delay between swaps
      if (i < swaps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`Multi-swap completed. ${results.length} transactions sent.`);
    showSuccessNotification(
      `Successfully completed ${results.length} swaps!`,
      "Multi-Swap Complete"
    );

    return results[results.length - 1]; // Return the last transaction hash
  } catch (error) {
    console.error("Multi-swap failed:", error);
    showErrorNotification(error, "Multi-Swap Failed");
    throw error;
  }
}

export async function swapTokens(
  walletClient: WalletClient,
  fromToken: Address,
  toToken: Address,
  amount: string,
  slippage: number = 1
): Promise<string> {
  try {
    const account = walletClient.account;
    if (!account) {
      throw new Error("Wallet account not available");
    }

    console.log(`=== Starting ParaSwap token swap ===`);
    console.log(`From: ${fromToken}`);
    console.log(`To: ${toToken}`);
    console.log(`Amount: ${amount}`);
    console.log(`Slippage: ${slippage}%`);

    showInfoNotification(
      `Getting ParaSwap quote for ${amount} tokens...`,
      "ParaSwap Started"
    );

    // Get ParaSwap quote
    const quote = await getParaSwapQuote(fromToken, toToken, amount, account.address);
    console.log(`ParaSwap quote received:`, {
      toAmount: quote.toAmount,
      data: quote.data ? `${quote.data.slice(0, 50)}...` : 'No data',
      fullData: quote.data,
      to: quote.to
    });
    
    // Validate the response
    if (!quote.data || quote.data.length < 42) {
      throw new Error("Invalid transaction data from ParaSwap");
    }
    
    // Check the function selector (first 4 bytes)
    const functionSelector = quote.data.slice(0, 10);
    console.log(`Transaction function selector: ${functionSelector}`);
    
    // Common ParaSwap function selectors
    const paraswapSelectors = {
      '0x5c11d795': 'swapOnUniswap', // swapOnUniswap
      '0x7c025200': 'swapOnUniswapFork', // swapOnUniswapFork
      '0x12aa3caf': 'swapOnZeroXv2', // swapOnZeroXv2
      '0xa94e78ef': 'swapOnUniswapV3Fork', // swapOnUniswapV3Fork
      '0x0': 'Invalid selector'
    };
    
    const functionName = paraswapSelectors[functionSelector as keyof typeof paraswapSelectors] || 'Unknown function';
    console.log(`ParaSwap function: ${functionName}`);
    
    // Get token info for formatting the result
    const toTokenInfo = await fetchTokenInfo(toToken);

    showInfoNotification(
      `Step 1/3: Approving USDC for ParaSwap...`,
      "ParaSwap Processing"
    );

    // Create public client for gas estimation
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    // Get optimized gas price
    const gasPrice = await getCurrentGasPrice(publicClient);
    console.log(`Using gas price: ${formatUnits(gasPrice, 9)} gwei`);

    // Get token info for the swap
    const fromTokenInfoSwap = await fetchTokenInfo(fromToken, 8453); // Base chain ID
    const toTokenInfoSwap = await fetchTokenInfo(toToken, 8453); // Base chain ID
    const fromDecimals = fromTokenInfoSwap?.decimals || getTokenDecimals(fromToken);
    const toDecimals = toTokenInfoSwap?.decimals || getTokenDecimals(toToken);
    const fromSymbol = fromTokenInfoSwap?.symbol || "Unknown";
    const toSymbol = toTokenInfoSwap?.symbol || "Unknown";
    
    // First, approve ParaSwap to spend USDC
    const amountWei = parseUnits(amount, fromDecimals);
    console.log(`Approving ${amount} USDC (${amountWei.toString()} wei) for ParaSwap...`);
    
    // Get the target address for approval (this should be the TokenTransferProxy contract)
    const approvalTargetAddress = quote.tokenTransferProxy;
    console.log(`TokenTransferProxy address: ${approvalTargetAddress}`);
    console.log(`Augustus Swapper address: ${quote.to}`);
    
    // Check current allowance
    const currentAllowance = await publicClient.readContract({
      address: fromToken,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, approvalTargetAddress],
    });
    
    console.log(`Current allowance: ${formatUnits(currentAllowance, fromDecimals)}`);
    
    // If allowance is insufficient, approve
    if (currentAllowance < amountWei) {
      console.log(`Insufficient allowance, approving ${amount} USDC for ParaSwap...`);
      
      // Estimate gas for approval
      let approvalGasEstimate: bigint;
      try {
        approvalGasEstimate = await publicClient.estimateGas({
          to: fromToken,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [approvalTargetAddress, amountWei],
          }),
          account: account.address,
          gasPrice,
        });
        // Add 10% buffer for approval
        approvalGasEstimate = (approvalGasEstimate * BigInt(110)) / BigInt(100);
        console.log(`Approval gas estimate: ${approvalGasEstimate.toString()}`);
      } catch (error) {
        console.warn("Approval gas estimation failed, using default:", error);
        approvalGasEstimate = BigInt(100000); // 100k gas should be enough for approval
      }

      // Execute approval transaction
      const approveHash = await walletClient.sendTransaction({
        to: fromToken,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [approvalTargetAddress, amountWei],
        }),
        gas: approvalGasEstimate,
        gasPrice,
        account: account,
        chain: base,
      });

      console.log(`Approval transaction sent: ${approveHash}`);
      showInfoNotification(
        `Step 1/3: Approval transaction sent. Waiting for confirmation...`,
        "ParaSwap Processing"
      );

      // Wait for approval confirmation with longer timeout
      console.log(`Waiting for approval confirmation...`);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ 
        hash: approveHash,
        timeout: 120000 // 2 minutes timeout
      });
      console.log(`Approval confirmed in block ${approvalReceipt.blockNumber}`);
      
      // Wait longer for the approval to be fully processed
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      
      // Verify the allowance was set correctly with retry logic
      let finalAllowance = 0n;
      let allowanceAttempts = 0;
      const maxAllowanceAttempts = 5;
      
      while (allowanceAttempts < maxAllowanceAttempts) {
        try {
          finalAllowance = await publicClient.readContract({
            address: fromToken,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [account.address, approvalTargetAddress],
          });
          
          if (finalAllowance >= parseUnits(amount, fromDecimals)) {
            console.log(`Allowance verified: ${formatUnits(finalAllowance, fromDecimals)} ${fromSymbol}`);
            break;
          }
          
          allowanceAttempts++;
          if (allowanceAttempts >= maxAllowanceAttempts) {
            throw new Error(`Approval failed - allowance is still insufficient after ${maxAllowanceAttempts} attempts.`);
          }
          
          console.log(`Allowance check ${allowanceAttempts}/${maxAllowanceAttempts}: ${formatUnits(finalAllowance, fromDecimals)} ${fromSymbol}, waiting...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between attempts
          
        } catch (error) {
          allowanceAttempts++;
          if (allowanceAttempts >= maxAllowanceAttempts) {
            throw new Error(`Failed to verify allowance after ${maxAllowanceAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          console.log(`Allowance verification attempt ${allowanceAttempts} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    } else {
      console.log(`Sufficient allowance already exists`);
    }

    showInfoNotification(
      `Step 2/3: Executing swap transaction (approval confirmed)...`,
      "ParaSwap Processing"
    );

    // Get the target address from the ParaSwap response
    const swapTargetAddress = quote.to as Address;
    console.log(`ParaSwap target address: ${swapTargetAddress}`);
    console.log(`Expected Augustus address: ${process.env.NEXT_PUBLIC_PARASWAP_AUGUSTUS_BASE}`);
    
    // Validate that the target address is valid
    if (!swapTargetAddress || swapTargetAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("Invalid target address from ParaSwap");
    }
    
    // Use the target address from ParaSwap response
    const finalTargetAddress = swapTargetAddress;
    console.log(`Using target address: ${finalTargetAddress}`);

    // Estimate gas for the swap transaction
    let gasEstimate: bigint;
    try {
      gasEstimate = await publicClient.estimateGas({
        to: finalTargetAddress,
        data: quote.data,
        value: 0n,
        account: walletClient.account!.address,
        gasPrice,
      });
      // Add 20% buffer for ParaSwap transactions
      gasEstimate = (gasEstimate * BigInt(120)) / BigInt(100);
      console.log(`ParaSwap gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
      console.warn("ParaSwap gas estimation failed, using default:", error);
      
      // Check if this is an allowance error during gas estimation
      if (error instanceof Error && error.message.includes('transfer amount exceeds allowance')) {
        console.log("⚠️ Gas estimation failed due to allowance - this is expected and will be resolved by the approval transaction");
        console.log("Proceeding with conservative gas estimate...");
      }
      
      // Conservative fallback for ParaSwap transactions
      gasEstimate = BigInt(500000); // 500k gas should handle most ParaSwap transactions
    }

    
    // Execute the swap transaction
    const hash = await walletClient.sendTransaction({
      to: finalTargetAddress,
      data: quote.data,
      value: 0n,
      gas: gasEstimate,
      gasPrice,
      account: account,
      chain: base,
    });

    console.log(`ParaSwap transaction sent: ${hash}`);

    showInfoNotification(
      `Step 2/3: ParaSwap transaction sent. Waiting for confirmation...`,
      "ParaSwap Processing"
    );

    // Wait for transaction confirmation with longer timeout
    console.log(`Waiting for swap confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      timeout: 180000 // 3 minutes timeout
    });
    console.log(`Swap confirmed in block ${receipt.blockNumber}`);
    
    // Wait for balance to be updated
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
    
    // Verify the swap was successful by checking the balance
    const finalBalance = await publicClient.readContract({
      address: toToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    
    const finalBalanceFormatted = formatUnits(finalBalance, toDecimals);
    console.log(`Final ${toSymbol} balance: ${finalBalanceFormatted}`);
    
    // Check if we received the expected amount (with some tolerance for slippage)
    const expectedAmount = parseFloat(quote.toAmount) / Math.pow(10, toDecimals);
    const actualAmount = parseFloat(finalBalanceFormatted);
    const slippageTolerance = 0.05; // 5% tolerance
    
    if (actualAmount < expectedAmount * (1 - slippageTolerance)) {
      console.warn(`Warning: Received less than expected. Expected: ${expectedAmount}, Actual: ${actualAmount}`);
    }

    if (receipt.status === "success") {
      // Use the same decimals we used for the quote
      const toAmount = formatUnits(BigInt(quote.toAmount), toDecimals);
      
      // Verify the actual balance after the swap
      const actualBalance = await getTokenBalance(toToken, account.address, toDecimals);
      console.log(`Expected amount: ${toAmount}, Actual balance: ${actualBalance}`);
      
      showSuccessNotification(
        `Step 2/3: Successfully swapped ${amount} tokens using ParaSwap! Received ${toAmount} tokens.`,
        "ParaSwap Successful"
      );
      return hash;
    } else {
      throw new Error("ParaSwap transaction failed");
    }

  } catch (error) {
    console.error("ParaSwap error details:", error);
    
    let errorMessage = "Unknown error occurred";
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage = "Transaction timed out. Please check the transaction on the blockchain explorer.";
      } else if (error.message.includes("user rejected")) {
        errorMessage = "Transaction was rejected by user.";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage = "Insufficient funds for transaction.";
      } else {
        errorMessage = error.message;
      }
    }
    
    showErrorNotification(new Error(errorMessage), "ParaSwap Failed");
    throw error;
  }
}

// Swap USDC to cbBTC (Coinbase Bitcoin on Base)
export async function swapUSDCToCbBTC(
  walletClient: WalletClient,
  usdcAmount: string
): Promise<string> {
  return await swapTokens(
    walletClient,
    TOKEN_ADDRESSES.USDC,
    TOKEN_ADDRESSES.cbBTC,
    usdcAmount,
    1 // 1% slippage
  );
}

// Check if user has enough USDC balance
export async function checkUSDCBalance(
  userAddress: Address,
  requiredAmount: string
): Promise<boolean> {
  const balance = await getTokenBalance(TOKEN_ADDRESSES.USDC, userAddress, 6);
  return parseFloat(balance) >= parseFloat(requiredAmount);
}

// Debug function to check transaction details
export async function debugTransaction(
  txHash: string,
  chainId: number = 8453
): Promise<void> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    const transaction = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    
    console.log(`Transaction ${txHash} details:`, {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      logs: receipt.logs.length,
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.input.slice(0, 10) // First 4 bytes (function selector)
    });

    // Check if it's a ParaSwap transaction by looking at the logs
    const transferLogs = receipt.logs.filter(log => 
      log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" // Transfer event
    );
    
    console.log(`Found ${transferLogs.length} transfer events in transaction`);
    
    // Check if the transaction was sent to the Augustus contract
    const augustusAddress = process.env.NEXT_PUBLIC_PARASWAP_AUGUSTUS_BASE;
    if (transaction.to?.toLowerCase() === augustusAddress?.toLowerCase()) {
      console.log("✅ Transaction was sent to Augustus contract");
    } else {
      console.log(`❌ Transaction was sent to ${transaction.to}, expected Augustus: ${augustusAddress}`);
    }
    
    // Log all events for debugging
    if (receipt.logs.length > 0) {
      console.log("All transaction events:", receipt.logs.map(log => ({
        address: log.address,
        topics: log.topics,
        data: log.data
      })));
    }
    
  } catch (error) {
    console.error(`Error debugging transaction ${txHash}:`, error);
  }
}

// Get current BTC price for more accurate swap calculations
export async function getBTCPrice(): Promise<number> {
  try {
    // Use CoinGecko API to get current BTC price
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await response.json();
    return data.bitcoin.usd;
  } catch (error) {
    console.warn("Failed to fetch BTC price, using fallback:", error);
    return 65000; // Fallback price
  }
}

// Enhanced swap function with real-time pricing
export async function swapUSDCToCbBTCWithPricing(
  walletClient: WalletClient,
  cbBTCAmount: string
): Promise<string> {
  try {
    // Get current BTC price
    const btcPrice = await getBTCPrice();
    const usdcAmount = (parseFloat(cbBTCAmount) * btcPrice).toFixed(2);
    
    console.log(`Current BTC price: $${btcPrice}`);
    console.log(`Swapping ${usdcAmount} USDC to get ${cbBTCAmount} cbBTC`);
    
    return await swapUSDCToCbBTC(walletClient, usdcAmount);
  } catch (error) {
    console.error("Enhanced swap error:", error);
    
    // If the swap fails due to API issues, show a helpful message
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error("Swap service temporarily unavailable. Please try again in a few moments or consider supplying USDC directly to Aave.");
    }
    
    throw error;
  }
}
