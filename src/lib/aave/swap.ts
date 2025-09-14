import { Address, WalletClient, parseUnits, formatUnits, createPublicClient, http, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { showErrorNotification, showSuccessNotification, showInfoNotification } from "@/lib/utils/errorHandling";
import { getAaveConfig } from "./config";
import { getParaSwapConfig, isParaSwapConfigured, getParaSwapConfigStatus } from "./swapConfig";

// Get current gas price for Base network
async function getCurrentGasPrice(publicClient: ReturnType<typeof createPublicClient>): Promise<bigint> {
  try {
    const gasPrice = await publicClient.getGasPrice();
    // Use base gas price without any multiplier to minimize fees
    return gasPrice; // Use exact base gas price
  } catch (error) {
    console.warn("Failed to get current gas price, using fallback:", error);
    // Fallback gas price for Base network (0.001 gwei)
    return parseUnits("0.001", 9); // 0.001 gwei
  }
}

// Optimized gas estimation for ParaSwap transactions
async function estimateParaSwapGas(
  publicClient: ReturnType<typeof createPublicClient>,
  to: Address,
  data: `0x${string}`,
  account: Address,
  gasPrice: bigint
): Promise<bigint> {
  try {
    const estimate = await publicClient.estimateGas({
      to,
      data,
      value: 0n,
      account,
      gasPrice,
    });
    
    // ParaSwap transactions are complex, use a more conservative buffer
    // But cap it at a reasonable maximum to prevent excessive fees
    const bufferedEstimate = (estimate * BigInt(125)) / BigInt(100); // 25% buffer
    const maxGas = BigInt(1200000); // Cap at 1.2M gas
    
    return bufferedEstimate > maxGas ? maxGas : bufferedEstimate;
  } catch (error) {
    console.warn("ParaSwap gas estimation failed:", error);
    // Conservative fallback for complex swap transactions
    return BigInt(800000); // 800k gas should handle most ParaSwap transactions
  }
}

// Base network token addresses
const TOKEN_ADDRESSES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
  WETH: "0x4200000000000000000000000000000000000006" as Address,
} as const;

// Use the configuration from swapConfig.ts

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

// ParaSwap adapter ABI (simplified version)
const PARASWAP_ADAPTER_ABI = [
  {
    inputs: [
      { internalType: "contract IERC20Detailed", name: "assetToSwapFrom", type: "address" },
      { internalType: "contract IERC20Detailed", name: "assetToSwapTo", type: "address" },
      { internalType: "uint256", name: "amountToSwap", type: "uint256" },
      { internalType: "uint256", name: "minAmountToReceive", type: "uint256" },
      { internalType: "uint256", name: "swapAllBalanceOffset", type: "uint256" },
      { internalType: "bytes", name: "swapCalldata", type: "bytes" },
      { internalType: "contract IParaSwapAugustus", name: "augustus", type: "address" },
      { 
        internalType: "struct IParaSwapLiquiditySwapAdapter.PermitSignature", 
        name: "permitParams", 
        type: "tuple",
        components: [
          { internalType: "uint256", name: "value", type: "uint256" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint8", name: "v", type: "uint8" },
          { internalType: "bytes32", name: "r", type: "bytes32" },
          { internalType: "bytes32", name: "s", type: "bytes32" },
        ]
      },
    ],
    name: "swapAndDeposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Get current BTC price for calculations
export async function getBTCPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const data = await response.json();
    return data.bitcoin.usd;
  } catch (error) {
    console.warn("Failed to fetch BTC price, using fallback:", error);
    return 65000; // Fallback price
  }
}

// Get ParaSwap quote for swap
async function getParaSwapQuote(
  fromToken: Address,
  toToken: Address,
  amount: string,
  fromAddress: Address,
  chainId: number = 8453
): Promise<{
  toAmount: string;
  data: `0x${string}`;
}> {
  const amountWei = parseUnits(amount, 6); // USDC has 6 decimals
  
  // Map chain IDs to ParaSwap API chain names
  const chainMap: Record<number, string> = {
    8453: 'base', // Base
    1: 'ethereum', // Ethereum
    42161: 'arbitrum', // Arbitrum
  };
  
  const chainName = chainMap[chainId];
  if (!chainName) {
    throw new Error(`Chain ${chainId} not supported by ParaSwap API`);
  }
  
  // Step 1: Get price quote
  const priceUrl = `https://apiv5.paraswap.io/prices/?srcToken=${fromToken}&destToken=${toToken}&amount=${amountWei.toString()}&srcDecimals=6&destDecimals=8&side=SELL&network=${chainId}&userAddress=${fromAddress}&partner=paraswap`;
  
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
      throw new Error(`Failed to get ParaSwap price quote: ${priceResponse.status} ${priceResponse.statusText}`);
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
      srcDecimals: 6,
      destDecimals: 8,
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
    };
  } catch (error) {
    console.error('ParaSwap API fetch error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ParaSwap quote request timed out. Please try again.');
    }
    throw new Error(`Failed to fetch ParaSwap quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Aave native swap using ParaSwap adapter
export async function swapAndSupplyWithAave(
  walletClient: WalletClient,
  fromToken: Address,
  toToken: Address,
  amount: string,
  chainId: number = 8453
): Promise<string> {
  try {
    const account = walletClient.account;
    if (!account) {
      throw new Error("Wallet account not available");
    }

    console.log(`=== Starting Aave native swap and supply ===`);
    console.log(`From: ${fromToken}`);
    console.log(`To: ${toToken}`);
    console.log(`Amount: ${amount}`);

    showInfoNotification(
      `Using Aave's native swap feature to swap ${amount} tokens...`,
      "Aave Swap Started"
    );

    // Get Aave config for the chain
    const config = getAaveConfig(chainId);
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainId}`);
    }

    // Check if ParaSwap is properly configured for this chain
    const configStatus = getParaSwapConfigStatus(chainId);
    if (!configStatus.isConfigured) {
      const missingAddresses = configStatus.missingAddresses.join(", ");
      throw new Error(`ParaSwap is not fully configured for Base network. Missing addresses: ${missingAddresses}. Please configure the ParaSwap adapter addresses in environment variables or use manual swapping through DEXs.`);
    }

    // Get ParaSwap configuration for this chain and validate
    const paraswapConfig = getParaSwapConfig(chainId);
    if (!paraswapConfig.AUGUSTUS || paraswapConfig.AUGUSTUS === '0x0000000000000000000000000000000000000000') {
      throw new Error(`Invalid Augustus address: ${paraswapConfig.AUGUSTUS}. ParaSwap is not properly configured for Base network.`);
    }
    
    console.log('ParaSwap config:', {
      SWAP_ADAPTER: paraswapConfig.SWAP_ADAPTER,
      AUGUSTUS: paraswapConfig.AUGUSTUS,
    });

    // Get the aToken address for the fromToken
    const fromTokenSymbol = Object.keys(config.reserves).find(sym =>
      config.reserves[sym].underlying.toLowerCase() === fromToken.toLowerCase()
    );
    if (!fromTokenSymbol) {
      throw new Error(`Token ${fromToken} not found in Aave reserves`);
    }
    const aTokenAddress = config.reserves[fromTokenSymbol].aToken;

    console.log(`aToken address for ${fromTokenSymbol}: ${aTokenAddress}`);

    // Check if user has the aToken balance
    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const aTokenBalance = await publicClient.readContract({
      address: aTokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    const requiredAmount = parseUnits(amount, 6); // USDC has 6 decimals
    if (aTokenBalance < requiredAmount) {
      throw new Error(`Insufficient aToken balance. Required: ${formatUnits(requiredAmount, 6)}, Available: ${formatUnits(aTokenBalance, 6)}`);
    }

    // Approve the ParaSwap adapter to spend aTokens
    showInfoNotification(
      `Approving ParaSwap adapter to spend aTokens...`,
      "Aave Swap Processing"
    );

    // Get optimized gas price
    const gasPrice = await getCurrentGasPrice(publicClient as any);
    console.log(`Using gas price: ${formatUnits(gasPrice, 9)} gwei`);

    // Estimate gas for approval transaction
    let approvalGasEstimate: bigint;
    try {
      approvalGasEstimate = await publicClient.estimateGas({
        to: aTokenAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [paraswapConfig.SWAP_ADAPTER, requiredAmount],
        }),
        account: account.address,
        gasPrice,
      });
      // Add 10% buffer for approval (simpler transaction)
      approvalGasEstimate = (approvalGasEstimate * BigInt(110)) / BigInt(100);
      console.log(`Approval gas estimate: ${approvalGasEstimate.toString()}`);
    } catch (error) {
      console.warn("Approval gas estimation failed, using default:", error);
      approvalGasEstimate = BigInt(100000); // 100k gas should be enough for approval
    }

    const approveHash = await walletClient.sendTransaction({
      account: account.address,
      chain: base,
      to: aTokenAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [paraswapConfig.SWAP_ADAPTER, requiredAmount],
      }),
      gas: approvalGasEstimate,
      gasPrice,
    });

    console.log(`Approval transaction sent: ${approveHash}`);
    const approvalCostETH = Number(formatUnits(approvalGasEstimate * gasPrice, 18));
    const approvalCostUSD = approvalCostETH * 3000; // Assuming ETH = $3000
    
    console.log(`Approval transaction details:`, {
      gasLimit: approvalGasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      estimatedCostETH: approvalCostETH.toFixed(6),
      estimatedCostUSD: `~$${approvalCostUSD.toFixed(2)}`
    });
    
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`Approval confirmed`);
    
    // Add a small delay to ensure the approval is processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the allowance was actually set
    const finalAllowance = await publicClient.readContract({
      address: aTokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, paraswapConfig.SWAP_ADAPTER],
    });
    console.log(`Final allowance after approval: ${finalAllowance.toString()}`);
    
    if (finalAllowance < parseUnits(amount, 6)) {
      throw new Error(`Approval failed - allowance is still insufficient. Expected: ${parseUnits(amount, 6).toString()}, Got: ${finalAllowance.toString()}`);
    }

    // Get ParaSwap quote
    const quote = await getParaSwapQuote(fromToken, toToken, amount, account.address, chainId);
    
    console.log(`ParaSwap quote received:`, quote);

    // Calculate minimum amount to receive (with 1% slippage)
    const minAmountToReceive = (BigInt(quote.toAmount) * BigInt(99)) / BigInt(100);

    // Prepare the swap and deposit transaction
    console.log('Preparing swap calldata with args:');
    console.log('- fromToken:', fromToken);
    console.log('- toToken:', toToken);
    console.log('- requiredAmount:', requiredAmount);
    console.log('- minAmountToReceive:', minAmountToReceive);
    console.log('- quote.data:', quote.data);
    console.log('- paraswapConfig.AUGUSTUS:', paraswapConfig.AUGUSTUS);
    console.log('- paraswapConfig.SWAP_ADAPTER:', paraswapConfig.SWAP_ADAPTER);
    
    // Validate all parameters before encoding
    if (!quote.data || typeof quote.data !== 'string') {
      throw new Error(`Invalid quote data: ${quote.data}`);
    }
    
    if (!paraswapConfig.AUGUSTUS || paraswapConfig.AUGUSTUS === '0x0000000000000000000000000000000000000000') {
      throw new Error(`Invalid Augustus address: ${paraswapConfig.AUGUSTUS}`);
    }
    
    const swapCalldata = encodeFunctionData({
      abi: PARASWAP_ADAPTER_ABI,
      functionName: "swapAndDeposit",
      args: [
        fromToken, // assetToSwapFrom
        toToken, // assetToSwapTo
        requiredAmount, // amountToSwap
        minAmountToReceive, // minAmountToReceive
        BigInt(0), // swapAllBalanceOffset (0 means don't swap all balance)
        quote.data, // swapCalldata from ParaSwap
        paraswapConfig.AUGUSTUS, // augustus
        {
          value: BigInt(0),
          deadline: BigInt(0),
          v: 0,
          r: "0x0000000000000000000000000000000000000000000000000000000000000000",
          s: "0x0000000000000000000000000000000000000000000000000000000000000000",
        }, // permitParams (empty)
      ],
    });
    
    console.log('Swap calldata encoded successfully:', swapCalldata);

    showInfoNotification(
      `Executing Aave native swap and supply transaction...`,
      "Aave Swap Processing"
    );

    // Use optimized gas estimation for ParaSwap transactions
    const gasEstimate = await estimateParaSwapGas(
      publicClient as ReturnType<typeof createPublicClient>,
      paraswapConfig.SWAP_ADAPTER,
      swapCalldata,
      account.address,
      gasPrice
    );
    console.log(`Estimated gas: ${gasEstimate.toString()}`);

    // Check if transaction is likely to fail by simulating it first
    let simulationAttempts = 0;
    const maxSimulationAttempts = 3;
    
    while (simulationAttempts < maxSimulationAttempts) {
      try {
        await publicClient.call({
          to: paraswapConfig.SWAP_ADAPTER,
          data: swapCalldata,
          account: account.address,
        });
        console.log("Transaction simulation successful - proceeding with transaction");
        break; // Success, exit the loop
      } catch (simulationError) {
        simulationAttempts++;
        console.error(`Transaction simulation failed (attempt ${simulationAttempts}/${maxSimulationAttempts}):`, simulationError);
        
        if (simulationAttempts >= maxSimulationAttempts) {
          throw new Error(`Transaction is likely to fail after ${maxSimulationAttempts} attempts. Please check your balance and try again. Simulation error: ${simulationError instanceof Error ? simulationError.message : 'Unknown error'}`);
        }
        
        // Wait 3 seconds before retrying simulation
        console.log("Waiting 3 seconds before retrying simulation...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Execute the swap and deposit transaction with gas limit and optimized price
    // Add timeout to prevent hanging transactions
    const transactionPromise = walletClient.sendTransaction({
      account: account.address,
      chain: base,
      to: paraswapConfig.SWAP_ADAPTER,
      data: swapCalldata,
      value: 0n,
      gas: gasEstimate,
      gasPrice,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Transaction timeout: The swap transaction took too long to be submitted. Please try again or use manual swapping."));
      }, 60000); // 60 second timeout
    });

    const hash = await Promise.race([transactionPromise, timeoutPromise]);

    console.log(`Aave swap transaction sent: ${hash}`);
    const estimatedCostETH = Number(formatUnits(gasEstimate * gasPrice, 18));
    const estimatedCostUSD = estimatedCostETH * 3000; // Assuming ETH = $3000
    
    console.log(`Transaction details:`, {
      gasLimit: gasEstimate.toString(),
      gasPrice: gasPrice.toString(),
      estimatedCostETH: estimatedCostETH.toFixed(6),
      estimatedCostUSD: `~$${estimatedCostUSD.toFixed(2)}`
    });

    // Warn user if gas cost seems high
    if (estimatedCostUSD > 5) {
      console.warn(`High gas cost detected: $${estimatedCostUSD.toFixed(2)}. This might be due to network congestion.`);
    }

    showInfoNotification(
      `Aave swap transaction sent. Estimated cost: ~$${estimatedCostUSD.toFixed(2)}. Waiting for confirmation...`,
      "Aave Swap Processing"
    );

    // Wait for transaction confirmation with timeout
    const receiptPromise = publicClient.waitForTransactionReceipt({ hash });
    const confirmationTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Transaction confirmation timeout: The transaction is taking longer than expected to be confirmed. You can check the transaction status manually."));
      }, 300000); // 5 minute timeout for confirmation
    });

    const receipt = await Promise.race([receiptPromise, confirmationTimeoutPromise]);

    if (receipt.status === "success") {
      const toAmount = formatUnits(BigInt(quote.toAmount), 8); // cbBTC has 8 decimals
      showSuccessNotification(
        `Successfully swapped and supplied ${amount} tokens using Aave! Received ${toAmount} tokens.`,
        "Aave Swap Successful"
      );
      return hash;
    } else {
      throw new Error("Aave swap transaction failed");
    }

  } catch (error) {
    console.error("Aave native swap error details:", error);
    
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    // If ParaSwap fails, provide a helpful message suggesting manual swap
    if (errorMessage.includes("ParaSwap") || errorMessage.includes("swap call data") || 
        errorMessage.includes("Invalid Augustus") || errorMessage.includes("not configured")) {
      errorMessage = "Aave native swap failed. This is likely due to ParaSwap not being properly configured for Base network. You can still supply USDC directly to Aave and manually swap through other DEXs like Uniswap or 1inch.";
    }
    
    // If transaction timeout occurs, provide specific guidance
    if (errorMessage.includes("timeout")) {
      errorMessage = "Transaction timeout occurred. This might be due to network congestion or invalid contract addresses. Please try again or use manual swapping.";
    }
    
    showErrorNotification(new Error(errorMessage), "Aave Swap Failed");
    throw error;
  }
}

// Swap USDC to cbBTC using Aave's native swap (no fallback)
export async function swapUSDCToCbBTCWithAave(
  walletClient: WalletClient,
  usdcAmount: string
): Promise<string> {
  // Use Aave native swap directly - if it fails, the error will be thrown
  return await swapAndSupplyWithAave(
    walletClient,
    TOKEN_ADDRESSES.USDC,
    TOKEN_ADDRESSES.cbBTC,
    usdcAmount,
    8453 // Base chain ID
  );
}

// Enhanced swap function with real-time pricing using Aave
export async function swapUSDCToCbBTCWithAavePricing(
  walletClient: WalletClient,
  cbBTCAmount: string
): Promise<string> {
  try {
    // Get current BTC price
    const btcPrice = await getBTCPrice();
    const usdcAmount = (parseFloat(cbBTCAmount) * btcPrice).toFixed(2);
    
    console.log(`Current BTC price: $${btcPrice}`);
    console.log(`Swapping ${usdcAmount} USDC to get ${cbBTCAmount} cbBTC using Aave native swap`);
    
    // Use Aave native swap directly - if it fails, the error will be thrown
    return await swapUSDCToCbBTCWithAave(walletClient, usdcAmount);
  } catch (error) {
    console.error("Aave enhanced swap error:", error);
    throw error;
  }
}
