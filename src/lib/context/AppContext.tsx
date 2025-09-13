"use client";
import { createContext, useContext, useState, ReactNode } from "react";

interface AppContextType {
  currentWallet: string | null;
  setCurrentWallet: (address: string | null) => void;
  removeWallet: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentWallet, setCurrentWallet] = useState<string | null>(null);

  const removeWallet = () => {
    setCurrentWallet(null);
  };

  return (
    <AppContext.Provider value={{
      currentWallet,
      setCurrentWallet,
      removeWallet,
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
