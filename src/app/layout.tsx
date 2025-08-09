"use client";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect, useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// metadata cannot be exported from a client component; moved into head tags below

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>Backtest AI</title>
        <meta name="description" content="Crypto portfolio backtester" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeWrapper>{children}</ThemeWrapper>
      </body>
    </html>
  );
}
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    const t = (typeof window !== "undefined" && window.sessionStorage.getItem("bt_theme")) || "dark";
    setTheme(t);
    if (t === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    const handler = (e: StorageEvent) => {
      if (e.key === "bt_theme" && e.newValue) {
        if (e.newValue === "light") document.documentElement.classList.remove("dark");
        else document.documentElement.classList.add("dark");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return <>{children}</>;
}
