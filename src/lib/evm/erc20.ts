
import { Address, PublicClient, erc20Abi, formatUnits } from "viem";

export async function readErc20Metadata(client: PublicClient, token: Address) {
  try {
    const [symbol, decimals, name] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
      client.readContract({ address: token, abi: erc20Abi, functionName: "name" }) as Promise<string>,
    ]);
    return { symbol, decimals, name };
  } catch (error) {
    console.warn(`Failed to read ERC20 metadata for ${token}:`, error);
    throw new Error(`Invalid ERC20 token at address ${token}. This address is not a valid ERC20 contract.`);
  }
}

export async function readErc20Balance(
  client: PublicClient,
  token: Address,
  owner: Address,
  decimalsHint?: number
) {
  try {
    const [balRaw, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>,
      typeof decimalsHint === "number"
        ? Promise.resolve(decimalsHint)
        : (client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>),
    ]);
    return formatUnits(balRaw, decimals);
  } catch (error) {
    console.warn(`Failed to read ERC20 balance for ${token}:`, error);
    throw new Error(`Failed to read balance for token ${token}. This might not be a valid ERC20 contract.`);
  }
}