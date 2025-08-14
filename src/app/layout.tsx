"use client";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppProvider } from "@/lib/context/AppContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>Backtest AI</title>
        <meta name="description" content="Advanced crypto portfolio backtesting and analysis" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeWrapper>
          <AppProvider>
            <ErrorBoundary>
              <div className="min-h-screen bg-[rgb(var(--bg-primary))]">
                <Navigation />
                <main className="container mx-auto px-4 py-6">
                  {children}
                </main>
              </div>
            </ErrorBoundary>
          </AppProvider>
        </ThemeWrapper>
      </body>
    </html>
  );
}

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<string | null>(null);
  
  useEffect(() => {
    const t = (typeof window !== "undefined" && window.sessionStorage.getItem("bt_theme")) || "dark";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t !== "light");
    
    const handler = (e: StorageEvent) => {
      if (e.key === "bt_theme" && e.newValue) {
        document.documentElement.classList.toggle("dark", e.newValue !== "light");
      }
    };
    
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  
  return <>{children}</>;
}
