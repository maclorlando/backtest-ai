"use client";

import { createContext, useContext, ReactNode } from 'react';
import { useLiFiWidget } from './LiFiWidget';

interface GlobalModalContextType {
  openLiFiWidget: () => void;
  closeLiFiWidget: () => void;
  isLiFiWidgetOpen: boolean;
}

const GlobalModalContext = createContext<GlobalModalContextType | undefined>(undefined);

export function GlobalModalProvider({ children }: { children: ReactNode }) {
  const { opened, openWidget, closeWidget, LiFiWidgetModal } = useLiFiWidget();

  return (
    <GlobalModalContext.Provider
      value={{
        openLiFiWidget: openWidget,
        closeLiFiWidget: closeWidget,
        isLiFiWidgetOpen: opened,
      }}
    >
      {children}
      <LiFiWidgetModal />
    </GlobalModalContext.Provider>
  );
}

export function useGlobalModal() {
  const context = useContext(GlobalModalContext);
  if (context === undefined) {
    throw new Error('useGlobalModal must be used within a GlobalModalProvider');
  }
  return context;
}
