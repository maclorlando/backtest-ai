"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { IconChartLine, IconWallet, IconBuildingBank, IconSettings, IconMenu, IconX, IconSun, IconMoon } from "@tabler/icons-react";
import WalletWidget from "./WalletWidget";

const navItems = [
  {
    href: "/",
    label: "Backtest",
    icon: IconChartLine,
    description: "Portfolio backtesting & analysis"
  },
  {
    href: "/aave",
    label: "Aave",
    icon: IconBuildingBank,
    description: "DeFi lending & borrowing"
  },
  {
    href: "/settings",
    label: "Settings",
    icon: IconSettings,
    description: "Configuration & preferences"
  }
];

export default function Navigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isClient, setIsClient] = useState(false);

  // Set client flag on mount
  useEffect(() => {
    setIsClient(true);
  }, []);

  const toggleTheme = () => {
    if (!isClient) return;
    
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    sessionStorage.setItem("bt_theme", newTheme);
  };

  return (
    <nav className="sticky top-0 z-50 bg-[rgb(var(--bg-primary))] border-b border-[rgb(var(--border-primary))] backdrop-blur-lg">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] rounded-lg flex items-center justify-center">
              <IconChartLine size={16} className="text-white sm:w-5 sm:h-5" />
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] rounded-lg flex items-center justify-center">
              <IconChartLine size={16} className="text-white sm:w-5 sm:h-5" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-[rgb(var(--fg-primary))]">Backtest AI</span>
            <span className="text-lg sm:text-xl font-bold text-[rgb(var(--fg-primary))]">Backtest AI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="icon-btn"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <IconSun size={18} className="sm:w-5 sm:h-5" /> : <IconMoon size={18} className="sm:w-5 sm:h-5" />}
              {theme === "dark" ? <IconSun size={18} className="sm:w-5 sm:h-5" /> : <IconMoon size={18} className="sm:w-5 sm:h-5" />}
            </button>

            {/* Wallet widget */}
            <div className="hidden sm:block">
              <WalletWidget />
            </div>
            {/* Wallet widget - hidden on mobile to save space */}
            <div className="hidden sm:block">
              <WalletWidget />
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="icon-btn md:hidden"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <IconX size={18} /> : <IconMenu size={18} />}
              {isMenuOpen ? <IconX size={18} /> : <IconMenu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-secondary))]">
            <div className="py-3 space-y-1">
            <div className="py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={18} />
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {/* Mobile wallet widget */}
              <div className="px-3 py-2">
                <WalletWidget />
              </div>
              {/* Mobile wallet widget */}
              <div className="px-3 py-2">
                <WalletWidget />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
