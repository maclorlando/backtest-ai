import { Address, PublicClient, WalletClient, parseUnits, erc20Abi } from "viem";

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
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, value],
    account,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
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
  const hash = await walletClient.writeContract({
    address: pool,
    abi: POOL_ABI,
    functionName: "supply",
    args: [asset, value, account.address, 0],
    account,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}