"use client";
import { useEffect, useState } from "react";
import { Card, Text, TextInput, Button, Group, Select, Switch, Divider, Badge } from "@mantine/core";
import { notifications } from "@mantine/notifications";
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
    
    notifications.show({ 
      title: "Settings Saved", 
      message: "Your preferences have been updated", 
      color: "green" 
    });
  }

  function clearAllData() {
    if (typeof window === "undefined") return;
    if (confirm("This will clear all saved portfolios, wallet data, and settings. This action cannot be undone.")) {
      localStorage.clear();
      sessionStorage.clear();
      notifications.show({ 
        title: "Data Cleared", 
        message: "All local data has been removed", 
        color: "blue" 
      });
      // Reload the page to reset state
      window.location.reload();
    }
  }

  return (
    <main className="space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="center">
          <Text size="lg" fw={700}>Application Settings</Text>
          <Button 
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={saveSettings} 
            disabled={!loaded}
          >
            Save All Settings
          </Button>
        </Group>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card withBorder shadow="sm" padding="lg">
          <Text size="md" fw={600} mb="md">API Configuration</Text>
          <Text size="sm" c="dimmed" mb="md">
            Provide your CoinGecko API key to improve rate limits and access premium features
          </Text>
          <TextInput
            label="CoinGecko API Key"
            placeholder="cg-..."
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            description="Get your free API key from coingecko.com"
          />
          <Badge 
            color={key ? "green" : "gray"} 
            variant="light" 
            mt="xs"
          >
            {key ? "API Key Configured" : "No API Key"}
          </Badge>
        </Card>

        <Card withBorder shadow="sm" padding="lg">
          <Text size="md" fw={600} mb="md">Appearance</Text>
          <Select
            label="Theme"
            value={theme}
            onChange={(val) => setTheme((val as "light" | "dark") || "dark")}
            data={[
              { value: "dark", label: "Dark Mode" },
              { value: "light", label: "Light Mode" }
            ]}
            leftSection={theme === "dark" ? <IconMoon size={16} /> : <IconSun size={16} />}
          />
          <Text size="xs" c="dimmed" mt="xs">
            Choose your preferred color scheme
          </Text>
        </Card>

        <Card withBorder shadow="sm" padding="lg">
          <Text size="md" fw={600} mb="md">Default Network</Text>
          <Select
            label="Default Blockchain Network"
            value={defaultChain}
            onChange={(val) => setDefaultChain(val || "11155111")}
            data={[
              { value: "11155111", label: "Sepolia Testnet" },
              { value: "1", label: "Ethereum Mainnet" },
              { value: "137", label: "Polygon" },
              { value: "42161", label: "Arbitrum One" }
            ]}
          />
          <Text size="xs" c="dimmed" mt="xs">
            This will be the default network for wallet and DeFi operations
          </Text>
        </Card>

        <Card withBorder shadow="sm" padding="lg">
          <Text size="md" fw={600} mb="md">Data Management</Text>
          <Text size="sm" c="dimmed" mb="md">
            Manage your local data and privacy settings
          </Text>
          <Button 
            variant="light" 
            color="red" 
            leftSection={<IconTrash size={16} />}
            onClick={clearAllData}
            fullWidth
          >
            Clear All Data
          </Button>
          <Text size="xs" c="dimmed" mt="xs">
            This will remove all saved portfolios, wallet data, and settings
          </Text>
        </Card>
      </div>

      <Card withBorder shadow="sm" padding="lg">
        <Text size="md" fw={600} mb="md">About</Text>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Version:</span>
            <span>1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Data Source:</span>
            <span>CoinGecko API</span>
          </div>
          <div className="flex justify-between">
            <span>Blockchain Support:</span>
            <span>Ethereum, Polygon, Arbitrum</span>
          </div>
          <div className="flex justify-between">
            <span>DeFi Protocols:</span>
            <span>Aave V3</span>
          </div>
        </div>
      </Card>
    </main>
  );
}