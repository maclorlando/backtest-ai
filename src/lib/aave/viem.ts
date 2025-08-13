import { Address, PublicClient, WalletClient, parseUnits, erc20Abi } from "viem";
import { showErrorNotification, showSuccessNotification, retryOperation } from "@/lib/utils/errorHandling";

export async function approveErc20(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    const hash = await retryOperation(async () => {
      return await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, value],
        account,
        chain: walletClient.chain,
      });
    }, 3, 2000);

    // Wait for transaction confirmation
    const receipt = await retryOperation(async () => {
      return await publicClient.waitForTransactionReceipt({ hash });
    }, 3, 3000);

    if (receipt.status === 'success') {
      showSuccessNotification(
        `Successfully approved ${amount} tokens for Aave Pool`,
        "Approval Successful"
      );
    } else {
      throw new Error("Transaction failed on chain");
    }

    return hash;
  } catch (error) {
    showErrorNotification(error, "Approval Failed");
    throw error;
  }
}

const POOL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
      { internalType: "uint16", name: "referralCode", type: "uint16" },
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function supplyToAave(
  publicClient: PublicClient,
  walletClient: WalletClient,
  pool: Address,
  asset: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    const hash = await retryOperation(async () => {
      return await walletClient.writeContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "supply",
        args: [asset, value, account.address, 0],
        account,
        chain: walletClient.chain,
      });
    }, 3, 2000);

    // Wait for transaction confirmation
    const receipt = await retryOperation(async () => {
      return await publicClient.waitForTransactionReceipt({ hash });
    }, 3, 3000);

    if (receipt.status === 'success') {
      showSuccessNotification(
        `Successfully supplied ${amount} to Aave Pool`,
        "Supply Successful"
      );
    } else {
      throw new Error("Transaction failed on chain");
    }

    return hash;
  } catch (error) {
    showErrorNotification(error, "Supply Failed");
    throw error;
  }
}

// Enhanced function to check allowance before approving
export async function checkAndApproveErc20(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    // Check current allowance
    const currentAllowance = await retryOperation(async () => {
      return await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, spender],
      }) as bigint;
    }, 3, 1000);

    // If allowance is sufficient, no need to approve
    if (currentAllowance >= value) {
      showInfoNotification(
        "Sufficient allowance already exists",
        "Approval Check"
      );
      return null;
    }

    // Approve if needed
    return await approveErc20(publicClient, walletClient, token, spender, amount, decimals);
  } catch (error) {
    showErrorNotification(error, "Allowance Check Failed");
    throw error;
  }
}