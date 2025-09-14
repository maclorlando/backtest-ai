"use client";
import { useState, useEffect, useRef } from "react";
import { useAccount, useDisconnect, useBalance } from "wagmi";
import { IconWallet, IconLogout, IconCopy, IconExternalLink, IconCheck } from "@tabler/icons-react";
import { showSuccessNotification, showErrorNotification } from "@/lib/utils/errorHandling";

export default function WalletWidget() {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address: address,
  });
  
  const [showMenu, setShowMenu] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      showSuccessNotification("Address copied to clipboard", "Copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showErrorNotification("Failed to copy address", "Copy Error");
    }
  };

  const openExplorer = () => {
    if (!address) return;
    const url = `https://basescan.org/address/${address}`;
    window.open(url, "_blank");
  };

  const disconnectWallet = async () => {
    try {
      disconnect();
      showSuccessNotification("Wallet disconnected", "Disconnected");
    } catch (error) {
      showErrorNotification("Failed to disconnect", "Disconnect Error");
    }
  };

  if (!isClient) {
    return (
      <div className="flex items-center gap-3">
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
        <div className="wallet-connect-wrapper">
          <appkit-button />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        
        <div className="relative" ref={menuRef}>
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
                </div>
                
                <div className="space-y-2">
                  <button
                    onClick={copyAddress}
                    className={`w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-primary))] flex items-center gap-2 transition-colors ${
                      copied ? 'bg-green-900/20 text-green-400' : ''
                    }`}
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    {copied ? 'Copied!' : 'Copy Address'}
                  </button>
                  <button
                    onClick={openExplorer}
                    className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-primary))] flex items-center gap-2 transition-colors"
                  >
                    <IconExternalLink size={14} />
                    View on Explorer
                  </button>
                  <button
                    onClick={disconnectWallet}
                    className="w-full text-left p-2 rounded hover:bg-red-900/20 text-red-400 flex items-center gap-2 transition-colors"
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