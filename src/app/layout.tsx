"use client";
import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect, useState } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
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
        <MantineProvider defaultColorScheme="dark" theme={quantTheme}>
          <Notifications position="top-center" />
          <ThemeWrapper>
            <AppProvider>
              <ErrorBoundary>
                <div className="mx-auto max-w-6xl p-6">
                  <Navigation />
                  {children}
                </div>
              </ErrorBoundary>
            </AppProvider>
          </ThemeWrapper>
        </MantineProvider>
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

const quantTheme = createTheme({
  fontFamily: "IBM Plex Sans, Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  primaryColor: "blue",
  defaultRadius: "md",
  headings: { fontFamily: "IBM Plex Sans, Inter, system-ui, sans-serif" },
  colors: {
    blue: ["#e8f1ff", "#d3e4ff", "#a6c7ff", "#79a9ff", "#4b8bff", "#1e6dff", "#1656cc", "#0f3f99", "#072766", "#011233"],
  },
});
