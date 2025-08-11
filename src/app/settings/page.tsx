"use client";
import { useEffect, useState } from "react";
import { Card, Text, TextInput, Button } from "@mantine/core";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || "" : "";
    setKey(k);
    setLoaded(true);
  }, []);

  function save() {
    if (typeof window === "undefined") return;
    localStorage.setItem("bt_cg_key", key.trim());
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Text size="lg" fw={700}>Configuration</Text>
        <Text size="sm" c="dimmed">Provide your CoinGecko API key (optional, used to improve rate limits)</Text>
        <div className="mt-3 flex gap-2 items-end">
          <TextInput
            label="CoinGecko API Key"
            placeholder="cg-..."
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button onClick={save} disabled={!loaded}>Save</Button>
        </div>
      </Card>
    </main>
  );
}