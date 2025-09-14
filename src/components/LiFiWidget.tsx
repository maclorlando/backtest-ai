"use client";

import { LiFiWidget, WidgetConfig } from '@lifi/widget';
import { useState, useEffect } from 'react';
import { Modal, Group, Text, Alert, Button } from '@mantine/core';
import { IconArrowsExchange, IconAlertCircle } from '@tabler/icons-react';

interface LiFiWidgetModalProps {
  opened: boolean;
  onClose: () => void;
}

export function LiFiWidgetModal({ opened, onClose }: LiFiWidgetModalProps) {
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const widgetConfig: WidgetConfig = {
    integrator: 'Backtest-AI',
    // Ensure the widget operates independently from parent app
    variant: undefined,
    // Disable wallet connection inheritance
    walletConfig: {
      onConnect: () => {
        // Allow independent wallet connections
      }
    },
    theme: {
      container: {
        border: '1px solid rgb(var(--border-primary))',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2)',
        backgroundColor: 'rgb(var(--bg-secondary))',
      },
    },
    // Remove chain restrictions to allow all supported chains
    // chains: {
    //   allow: [8453], // Base mainnet chain ID
    // },
    // Remove token restrictions to allow all supported tokens
    // tokens: {
    //   featured: [
    //     {
    //       address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    //       symbol: 'USDC',
    //       name: 'USD Coin',
    //       decimals: 6,
    //       chainId: 8453,
    //     },
    //     {
    //       address: '0x4200000000000000000000000000000000000006', // WETH on Base
    //       symbol: 'WETH',
    //       name: 'Wrapped Ether',
    //       decimals: 18,
    //       chainId: 8453,
    //     },
    //     {
    //       address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbBTC on Base
    //       symbol: 'cbBTC',
    //       name: 'Coinbase Wrapped Bitcoin',
    //       decimals: 8,
    //       chainId: 8453,
    //     },
    //   ],
    // },
    // Bridge configuration - allow all supported bridges
    bridges: {
      allow: ['stargate', 'hop', 'across', 'synapse', 'layerzero', 'wormhole'],
    },
    // Swap configuration - allow all supported exchanges
    exchanges: {
      allow: ['uniswap', 'sushiswap', '1inch', 'paraswap', 'kyberswap'],
    },
    // UI customization
    appearance: 'dark',
  };

  useEffect(() => {
    if (opened) {
      setIsLoading(true);
      setWidgetError(null);
      
      // Reset loading state after a short delay to allow widget to load
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 2000);

      // Add keyboard escape handler
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleEscape);
      };
    } else {
      setIsLoading(false);
      setWidgetError(null);
    }
  }, [opened, onClose]);

  if (!opened) {
    return null;
  }

  // Simple HTML modal for testing
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        overflow: 'auto'
      }}
      onClick={(e) => {
        // Only close if clicking directly on the overlay, not on child elements
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="lifi-modal-content"
        style={{
          backgroundColor: 'rgb(var(--bg-secondary))',
          borderRadius: '12px',
          padding: '20px',
          width: '90vw',
          maxWidth: '1200px',
          height: '90vh',
          maxHeight: '900px',
          minHeight: '700px',
          overflow: 'auto',
          border: '1px solid rgb(var(--border-primary))',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: 'rgb(var(--fg-primary))' }}>Swap & Bridge</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'rgb(var(--fg-primary))',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: '500px', height: '100%' }}>
          {isLoading && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              zIndex: 10,
              color: 'rgb(var(--fg-primary))'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>Loading Swap Widget...</div>
              <div style={{ fontSize: '14px', color: 'rgb(var(--fg-secondary))' }}>Please wait while we initialize the trading interface</div>
            </div>
          )}
          
          {widgetError && (
            <div style={{ 
              margin: '20px', 
              padding: '12px', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgb(var(--danger))', 
              borderRadius: '8px',
              color: 'rgb(var(--fg-primary))'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>Widget Error</div>
              <div style={{ fontSize: '14px' }}>{widgetError}</div>
            </div>
          )}
          
          <div style={{ 
            height: '100%', 
            width: '100%',
            opacity: isLoading ? 0.3 : 1,
            transition: 'opacity 0.3s ease'
          }}>
            {!widgetError ? (
              <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
                <div style={{ 
                  height: '100%', 
                  width: '100%',
                  isolation: 'isolate',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <LiFiWidget 
                    integrator="Backtest-AI" 
                    config={widgetConfig}
                  />
                </div>
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                padding: '20px',
                textAlign: 'center',
                color: 'rgb(var(--fg-primary))'
              }}>
                <IconArrowsExchange size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>Swap Widget Unavailable</div>
                <div style={{ fontSize: '14px', color: 'rgb(var(--fg-secondary))', marginBottom: '20px' }}>
                  The swap widget is temporarily unavailable. Please try again later.
                </div>
                <button
                  onClick={() => {
                    setWidgetError(null);
                    setIsLoading(true);
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ec4899',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for easy integration
export function useLiFiWidget() {
  const [opened, setOpened] = useState(false);

  const openWidget = () => setOpened(true);
  const closeWidget = () => setOpened(false);

  return {
    opened,
    openWidget,
    closeWidget,
    LiFiWidgetModal: () => (
      <LiFiWidgetModal opened={opened} onClose={closeWidget} />
    ),
  };
}
