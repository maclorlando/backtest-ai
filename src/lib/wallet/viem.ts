"use client";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { type Chain } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

export function buildPublicClient(chain: Chain, rpcUrl?: string): PublicClient {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export function buildWalletClient(chain: Chain, privateKeyHex: `0x${string}`, rpcUrl?: string): WalletClient {
  const account = privateKeyToAccount(privateKeyHex);
  return createWalletClient({ chain, transport: http(rpcUrl), account });
}

export function createRandomPrivateKey(): `0x${string}` {
  return generatePrivateKey();
}