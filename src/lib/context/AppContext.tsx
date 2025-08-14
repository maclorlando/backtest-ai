"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { loadWallet } from "@/lib/wallet/storage";

interface AppContextType {
  currentWallet: string | null;
  currentNetwork: number;
  setCurrentWallet: (address: string | null) => void;
  setCurrentNetwork: (chainId: number) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentWallet, setCurrentWallet] = useState<string | null>(null);
  const [currentNetwork, setCurrentNetwork] = useState<number>(1); // Default to Ethereum

  // Load wallet on mount
  useEffect(() => {
    const wallet = loadWallet();
    if (wallet?.address) {
      setCurrentWallet(wallet.address);
    }
  }, []);

  return (
    <AppContext.Provider value={{
      currentWallet,
      currentNetwork,
      setCurrentWallet,
      setCurrentNetwork,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
