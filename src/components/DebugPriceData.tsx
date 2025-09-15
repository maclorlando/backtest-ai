"use client";
import React, { useState } from 'react';
import { checkPriceDataAvailability, fetchCurrentPricesUSD } from '@/lib/prices';
import { getCoinGeckoApiKey } from '@/lib/utils/apiKey';
import type { AssetId } from '@/lib/types';

export default function DebugPriceData() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>('');
  const [apiKey, setApiKey] = useState(getCoinGeckoApiKey() || '');

  const testAssets: AssetId[] = ['bitcoin', 'ethereum', 'usd-coin'];

  const testPriceData = async () => {
    setTesting(true);
    setResult('Testing...\n');
    
    try {
      // Test availability check
      setResult(prev => prev + '1. Testing price data availability...\n');
      const availability = await checkPriceDataAvailability(testAssets, apiKey || undefined);
      setResult(prev => prev + `   Available: ${availability.available}\n`);
      if (availability.error) {
        setResult(prev => prev + `   Error: ${availability.error}\n`);
      }
      
      // Test actual price fetching
      setResult(prev => prev + '2. Testing price fetching...\n');
      const prices = await fetchCurrentPricesUSD(testAssets, apiKey || undefined);
      setResult(prev => prev + `   Prices: ${JSON.stringify(prices, null, 2)}\n`);
      
      // Test API key info
      setResult(prev => prev + '3. API Key Info:\n');
      setResult(prev => prev + `   Has API Key: ${!!apiKey}\n`);
      setResult(prev => prev + `   API Key Length: ${apiKey.length}\n`);
      const isDemoKey = apiKey.toLowerCase().includes('demo') || 
                       apiKey.length < 20 || 
                       apiKey.toLowerCase().includes('test') ||
                       apiKey.toLowerCase().includes('free');
      setResult(prev => prev + `   Is Demo Key: ${isDemoKey}\n`);
      setResult(prev => prev + `   Endpoint: ${isDemoKey ? 'api.coingecko.com' : 'pro-api.coingecko.com'}\n`);
      
    } catch (error) {
      setResult(prev => prev + `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card max-w-2xl">
      <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Debug Price Data</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">
            CoinGecko API Key (optional)
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your CoinGecko API key or leave empty for free tier"
            className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-[rgb(var(--bg-secondary))] text-[rgb(var(--fg-primary))]"
          />
        </div>
        
        <button
          onClick={testPriceData}
          disabled={testing}
          className="btn btn-primary"
        >
          {testing ? 'Testing...' : 'Test Price Data Connection'}
        </button>
        
        {result && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Test Results:</h4>
            <pre className="text-xs bg-[rgb(var(--bg-secondary))] p-3 rounded-lg overflow-auto max-h-96 text-[rgb(var(--fg-primary))]">
              {result}
            </pre>
            {result.includes('Demo API key detected but using wrong endpoint') && (
              <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                <div className="text-sm text-yellow-300">
                  <strong>Common Issue Detected:</strong> Your API key appears to be a demo key but the system is trying to use the pro endpoint. 
                  This usually happens when the API key detection logic fails. Try using a key that clearly contains &quot;demo&quot; in the name.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
