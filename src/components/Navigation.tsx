"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
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
    href: "/wallet",
    label: "Wallet",
    icon: IconWallet,
    description: "Wallet management & balances"
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

  const toggleTheme = () => {
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
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] rounded-lg flex items-center justify-center">
              <IconChartLine size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-[rgb(var(--fg-primary))]">Backtest AI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className="nav-item">
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="icon-btn"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
            </button>

            {/* Wallet widget */}
            <WalletWidget />

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="icon-btn md:hidden"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-secondary))]">
            <div className="py-4 space-y-2">
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
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
