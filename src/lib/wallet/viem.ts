"use client";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { type Chain } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { FALLBACK_RPC_BY_CHAIN } from "@/lib/evm/networks";

export function buildPublicClient(chain: Chain, rpcUrl?: string): PublicClient {
  return createPublicClient({ 
    chain, 
    transport: http(rpcUrl, {
      timeout: 10000, // 10 second timeout
      retryCount: 3,
      retryDelay: 1000,
    })
  });
}

export function buildPublicClientWithFallback(chain: Chain, primaryRpc?: string): PublicClient {
  const fallbacks = FALLBACK_RPC_BY_CHAIN[chain.id] || [];
  const rpcUrls = primaryRpc ? [primaryRpc, ...fallbacks] : fallbacks;
  
  return createPublicClient({ 
    chain, 
    transport: http(rpcUrls[0], {
      timeout: 10000,
      retryCount: 3,
      retryDelay: 1000,
    })
  });
}

export function buildWalletClient(chain: Chain, privateKeyHex: `0x${string}`, rpcUrl?: string): WalletClient {
  const account = privateKeyToAccount(privateKeyHex);
  return createWalletClient({ 
    chain, 
    transport: http(rpcUrl, {
      timeout: 15000, // Longer timeout for write operations
      retryCount: 3,
      retryDelay: 1000,
    }), 
    account 
  });
}

export function createRandomPrivateKey(): `0x${string}` {
  return generatePrivateKey();
}