import { Chain, defineChain } from "viem";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";

export type SupportedChain = Chain;

export const CHAINS: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [baseSepolia.id]: baseSepolia,
};

export const DEFAULT_RPC_BY_CHAIN: Record<number, string> = {
  [sepolia.id]: "https://rpc.sepolia.org",
  [arbitrumSepolia.id]: "https://sepolia-rollup.arbitrum.io/rpc",
  [baseSepolia.id]: "https://sepolia.base.org",
};