import { describe, it, expect } from 'vitest';
import { aaveClient } from '../lib/aave/client';
import { chains } from '@aave/client/actions';

describe('Aave SDK Integration', () => {
  it('should create Aave client successfully', () => {
    expect(aaveClient).toBeDefined();
  });

  it('should fetch supported chains', async () => {
    const result = await chains(aaveClient);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});
