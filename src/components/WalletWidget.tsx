"use client";
import { useState, useEffect } from "react";
import { useAccount, useDisconnect, useBalance, useSwitchChain } from "wagmi";
import { IconWallet, IconLogout, IconCopy, IconExternalLink, IconBrandCoinbase } from "@tabler/icons-react";
import { showSuccessNotification, showErrorNotification } from "@/lib/utils/errorHandling";
import { base } from "viem/chains";

export default function WalletWidget() {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({
    address: address,
  });
  
  const [showMenu, setShowMenu] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  const isOnBaseMainnet = (chainId: number | undefined) => {
    return chainId === base.id;
  };

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    showSuccessNotification("Address copied to clipboard", "Copied");
  };

  const openExplorer = () => {
    if (!address) return;
    const url = `https://basescan.org/address/${address}`;
    window.open(url, "_blank");
  };

  const switchToBase = async () => {
    try {
      await switchChain({ chainId: base.id });
      showSuccessNotification("Switched to Base Mainnet", "Network Changed");
    } catch (error) {
      showErrorNotification(error, "Failed to switch network");
    }
  };

  const disconnectWallet = async () => {
    try {
      disconnect();
      showSuccessNotification("Wallet disconnected", "Disconnected");
    } catch (error) {
      showErrorNotification(error, "Failed to disconnect");
    }
  };

  if (!isClient) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
          <IconBrandCoinbase size={16} />
          Base Mainnet
        </div>
        <button className="btn btn-primary" disabled>
          <IconWallet size={16} />
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
          <IconBrandCoinbase size={16} />
          Base Mainnet
        </div>
        
        <appkit-button />
      </div>
    );
  }

  return (
    <>
      {/* Network Switch Prompt */}
      {!isOnBaseMainnet(chainId) && (
        <div className="fixed top-4 right-4 z-50 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 max-w-sm">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                Switch to Base Mainnet
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                This dApp only works on Base Mainnet. Please switch your wallet to Base to continue.
              </p>
              <button
                onClick={switchToBase}
                className="btn btn-primary btn-sm"
              >
                Switch to Base
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
          <IconBrandCoinbase size={16} />
          Base Mainnet
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <IconWallet size={16} />
            <span className="hidden sm:inline">
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect Wallet"}
            </span>
            {balance && (
              <span className="text-xs text-[rgb(var(--fg-tertiary))]">
                {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
              </span>
            )}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg shadow-lg z-50">
              <div className="p-4">
                <div className="mb-4">
                  <div className="text-sm font-medium text-[rgb(var(--fg-primary))] mb-1">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "No Address"}
                  </div>
                  {balance && (
                    <div className="text-xs text-[rgb(var(--fg-secondary))]">
                      {parseFloat(balance.formatted).toFixed(4)} {balance.symbol}
                    </div>
                  )}
                  <div className="text-xs text-[rgb(var(--fg-tertiary))] mt-1">
                    Chain: {chainId} | On Base: {isOnBaseMainnet(chainId) ? 'Yes' : 'No'}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <button
                    onClick={copyAddress}
                    className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                  >
                    <IconCopy size={14} />
                    Copy Address
                  </button>
                  <button
                    onClick={openExplorer}
                    className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                  >
                    <IconExternalLink size={14} />
                    View on Explorer
                  </button>
                  <button
                    onClick={disconnectWallet}
                    className="w-full text-left p-2 rounded hover:bg-red-900/20 text-red-400 flex items-center gap-2"
                  >
                    <IconLogout size={14} />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}