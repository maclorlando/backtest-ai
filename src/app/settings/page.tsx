"use client";
import { useEffect, useState } from "react";
import { IconDeviceFloppy, IconTrash, IconSun, IconMoon } from "@tabler/icons-react";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [defaultChain, setDefaultChain] = useState("11155111");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || "" : "";
    const t = typeof window !== "undefined" ? (sessionStorage.getItem("bt_theme") as "light" | "dark") || "dark" : "dark";
    const c = typeof window !== "undefined" ? localStorage.getItem("bt_default_chain") || "11155111" : "11155111";
    setKey(k);
    setTheme(t);
    setDefaultChain(c);
    setLoaded(true);
  }, []);

  function saveSettings() {
    if (typeof window === "undefined") return;
    localStorage.setItem("bt_cg_key", key.trim());
    localStorage.setItem("bt_default_chain", defaultChain);
    sessionStorage.setItem("bt_theme", theme);
    
    // Apply theme immediately
    document.documentElement.classList.toggle("dark", theme === "dark");
    
    // Show notification
    const toast = document.createElement("div");
    toast.className = "fixed top-4 right-4 z-50 p-4 rounded-lg border max-w-sm bg-green-900 border-green-700 text-green-100";
    toast.innerHTML = `
      <div class="font-semibold">Settings Saved</div>
      <div class="text-sm opacity-90">Your preferences have been updated</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function clearAllData() {
    if (typeof window === "undefined") return;
    if (confirm("This will clear all saved portfolios, wallet data, and settings. This action cannot be undone.")) {
      localStorage.clear();
      sessionStorage.clear();
      
      // Show notification
      const toast = document.createElement("div");
      toast.className = "fixed top-4 right-4 z-50 p-4 rounded-lg border max-w-sm bg-blue-900 border-blue-700 text-blue-100";
      toast.innerHTML = `
        <div class="font-semibold">Data Cleared</div>
        <div class="text-sm opacity-90">All local data has been removed</div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
      
      // Reload the page to reset state
      window.location.reload();
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">DeBank Settings</h1>
            <p className="text-[rgb(var(--fg-secondary))]">Configure your preferences and API settings</p>
          </div>
          <button 
            onClick={saveSettings} 
            disabled={!loaded}
            className="btn btn-primary"
          >
            <IconDeviceFloppy size={16} />
            Save All Settings
          </button>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="widget-grid">
        {/* API Configuration */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">API Configuration</h3>
          <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">
            Provide your CoinGecko API key to improve rate limits and access premium features
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">CoinGecko API Key</label>
              <input
                type="text"
                placeholder="cg-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="input w-full"
              />
              <p className="text-xs text-[rgb(var(--fg-tertiary))] mt-1">Get your free API key from coingecko.com</p>
            </div>
            
            <div className={`badge ${key ? 'badge-success' : ''}`}>
              {key ? "API Key Configured" : "No API Key"}
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Appearance</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                className="input w-full"
              >
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
              </select>
              <p className="text-xs text-[rgb(var(--fg-tertiary))] mt-1">Choose your preferred color scheme</p>
            </div>
          </div>
        </div>

        {/* Default Network */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Default Network</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Default Blockchain Network</label>
              <select
                value={defaultChain}
                onChange={(e) => setDefaultChain(e.target.value)}
                className="input w-full"
              >
                <option value="11155111">Sepolia Testnet</option>
                <option value="1">Ethereum Mainnet</option>
                <option value="137">Polygon</option>
                <option value="42161">Arbitrum One</option>
              </select>
              <p className="text-xs text-[rgb(var(--fg-tertiary))] mt-1">This will be the default network for wallet and DeFi operations</p>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Data Management</h3>
          <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">
            Manage your local data and privacy settings
          </p>
          
          <div className="space-y-3">
            <button 
              onClick={clearAllData}
              className="btn btn-secondary w-full text-red-400 hover:text-red-300"
            >
              <IconTrash size={16} />
              Clear All Data
            </button>
            <p className="text-xs text-[rgb(var(--fg-tertiary))]">
              This will remove all saved portfolios, wallet data, and settings
            </p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">About</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[rgb(var(--fg-secondary))]">Version:</span>
            <span className="text-[rgb(var(--fg-primary))]">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgb(var(--fg-secondary))]">Data Source:</span>
            <span className="text-[rgb(var(--fg-primary))]">CoinGecko API</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgb(var(--fg-secondary))]">Blockchain Support:</span>
            <span className="text-[rgb(var(--fg-primary))]">Ethereum, Polygon, Arbitrum</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgb(var(--fg-secondary))]">DeFi Protocols:</span>
            <span className="text-[rgb(var(--fg-primary))]">Aave V3</span>
          </div>
        </div>
      </div>
    </div>
  );
}