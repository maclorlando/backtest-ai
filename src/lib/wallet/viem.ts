"use client";
import { createPublicClient, http, type PublicClient } from "viem";
import { type Chain } from "viem/chains";
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