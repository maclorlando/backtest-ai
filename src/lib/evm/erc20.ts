
import { Address, PublicClient, erc20Abi, formatUnits } from "viem";

export async function readErc20Metadata(client: PublicClient, token: Address) {
  const [symbol, decimals, name] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }) as Promise<string>,
  ]);
  return { symbol, decimals, name };
}

export async function readErc20Balance(
  client: PublicClient,
  token: Address,
  owner: Address,
  decimalsHint?: number
) {
  const [balRaw, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>,
    typeof decimalsHint === "number"
      ? Promise.resolve(decimalsHint)
      : (client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>),
  ]);
  return { raw: balRaw, value: Number(formatUnits(balRaw, decimals)), decimals };
}