"use client";
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { base } from 'viem/chains';

export interface WalletConnectConfig {
  projectId: string;
  chains: number[];
  optionalChains: number[];
  methods: string[];
  events: string[];
  rpcMap: Record<number, string>;
}

// Validate project ID
function getProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
    
  if (!projectId || projectId === 'your-project-id') {
    console.warn('WalletConnect Project ID not configured. Please set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID in your .env file');
    return '';
  }
  return projectId;
}

// Base Mainnet configuration
export const WALLETCONNECT_CONFIG: WalletConnectConfig = {
  projectId: getProjectId(),
  chains: [base.id], // Only Base Mainnet
  optionalChains: [],
  methods: [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
    'wallet_switchEthereumChain',
    'wallet_addEthereumChain',
  ],
  events: [
    'chainChanged',
    'accountsChanged',
    'connect',
    'disconnect',
  ],
  rpcMap: {
    [base.id]: 'https://mainnet.base.org',
  },
};

export class WalletConnectManager {
  private provider: EthereumProvider | null = null;
  private modal: WalletConnectModal | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Check if WalletConnect is properly configured
    if (!WALLETCONNECT_CONFIG.projectId) {
      throw new Error('WalletConnect Project ID not configured. Please set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID in your .env file');
    }

    try {
      // Initialize WalletConnect Modal
      this.modal = new WalletConnectModal({
        projectId: WALLETCONNECT_CONFIG.projectId,
        chains: WALLETCONNECT_CONFIG.chains,
        optionalChains: WALLETCONNECT_CONFIG.optionalChains,
        enableNetworkSwitching: true,
        enableAccountView: true,
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
          '19177a98252e07ddfc9af2083ba8e07ef627cb6103467ffebb3f8f4205fd7927', // Coinbase Wallet
        ],
        explorerExcludedWalletIds: 'ALL',
        termsOfServiceUrl: 'https://backtest-ai.com/terms',
        privacyPolicyUrl: 'https://backtest-ai.com/privacy',
      });

      // Initialize Ethereum Provider with fresh session
      this.provider = await EthereumProvider.init({
        projectId: WALLETCONNECT_CONFIG.projectId,
        chains: WALLETCONNECT_CONFIG.chains,
        optionalChains: WALLETCONNECT_CONFIG.optionalChains,
        methods: WALLETCONNECT_CONFIG.methods,
        events: WALLETCONNECT_CONFIG.events,
        rpcMap: WALLETCONNECT_CONFIG.rpcMap,
        showQrModal: true,
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '1000',
          },
        },
        // Force a fresh session by not persisting previous connections
        disableProviderPing: true,
        // Don't auto-connect to existing sessions
        metadata: {
          name: 'Backtest AI',
          description: 'DeFi Portfolio Management',
          url: 'https://backtest-ai.com',
          icons: ['https://backtest-ai.com/icon.png']
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize WalletConnect:', error);
      throw error;
    }
  }

  async connect(): Promise<string[]> {
    await this.initialize();

    if (!this.provider) {
      throw new Error('WalletConnect provider not initialized');
    }

    try {
      // Force a fresh connection by calling enable() which shows the modal
      const accounts = await this.provider.enable();
      return accounts;
    } catch (error) {
      console.error('Failed to connect wallet via WalletConnect:', error);
      throw error;
    }
  }

  async connectFresh(): Promise<string[]> {
    // Force a completely fresh connection by clearing state first
    await this.disconnect();
    return this.connect();
  }


  async disconnect(): Promise<void> {
    if (this.provider) {
      try {
        await this.provider.disconnect();
      } catch (error) {
        console.warn('Error disconnecting WalletConnect provider:', error);
      }
    }
    
    // Clear WalletConnect localStorage to force fresh connection
    if (typeof window !== 'undefined') {
      try {
        // Clear all WalletConnect related data
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('wc@2:') || 
              key.startsWith('walletconnect') || 
              key.startsWith('@walletconnect') ||
              key.includes('walletconnect')) {
            localStorage.removeItem(key);
          }
        });
        
        // Also clear sessionStorage
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach(key => {
          if (key.startsWith('wc@2:') || 
              key.startsWith('walletconnect') || 
              key.startsWith('@walletconnect') ||
              key.includes('walletconnect')) {
            sessionStorage.removeItem(key);
          }
        });
        
        console.log('Cleared all WalletConnect session data');
      } catch (error) {
        console.warn('Error clearing WalletConnect storage:', error);
      }
    }
    
    // Clear the provider to force fresh connection
    this.provider = null;
    this.modal = null;
    this.isInitialized = false;
  }

  async switchToBase(): Promise<void> {
    if (!this.provider) {
      throw new Error('WalletConnect provider not available');
    }

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${base.id.toString(16)}` }],
      });
    } catch (error: any) {
      // If the chain is not added, add it
      if (error.code === 4902) {
        await this.provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${base.id.toString(16)}`,
              chainName: base.name,
              nativeCurrency: base.nativeCurrency,
              rpcUrls: [base.rpcUrls.default.http[0]],
              blockExplorerUrls: [base.blockExplorers.default.url],
            },
          ],
        });
      } else {
        throw error;
      }
    }
  }

  getProvider(): any {
    return this.provider;
  }

  isConnected(): boolean {
    return this.provider?.connected || false;
  }

  getAccounts(): string[] {
    return this.provider?.accounts || [];
  }

  getChainId(): number | null {
    return this.provider?.chainId || null;
  }

  onAccountsChanged(callback: (accounts: string[]) => void): void {
    if (this.provider) {
      this.provider.on('accountsChanged', callback);
    }
  }

  onChainChanged(callback: (chainId: number) => void): void {
    if (this.provider) {
      this.provider.on('chainChanged', callback);
    }
  }

  onDisconnect(callback: () => void): void {
    if (this.provider) {
      this.provider.on('disconnect', callback);
    }
  }

  removeAllListeners(): void {
    if (this.provider) {
      this.provider.removeAllListeners();
    }
  }
}

// Singleton instance
export const walletConnectManager = new WalletConnectManager();
