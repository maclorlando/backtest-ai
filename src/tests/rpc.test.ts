import { describe, it, expect } from 'vitest';
import { buildPublicClient, buildPublicClientWithFallback } from '@/lib/wallet/viem';
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from '@/lib/evm/networks';

describe('RPC Connection Tests', () => {
  it('should create public client with fallback', () => {
    const chain = CHAINS[11155111]; // Sepolia
    const rpc = DEFAULT_RPC_BY_CHAIN[11155111];
    
    const client = buildPublicClientWithFallback(chain, rpc);
    expect(client).toBeDefined();
    expect(client.chain).toBe(chain);
  });

  it('should create public client with timeout and retry config', () => {
    const chain = CHAINS[11155111]; // Sepolia
    const rpc = DEFAULT_RPC_BY_CHAIN[11155111];
    
    const client = buildPublicClient(chain, rpc);
    expect(client).toBeDefined();
    expect(client.chain).toBe(chain);
  });
});
