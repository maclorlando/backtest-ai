"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Text, Button, Select, Tabs, Table, Badge } from "@mantine/core";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig, mapAssetIdToAaveSymbol } from "@/lib/aave/config";
import { buildPublicClient, buildWalletClient } from "@/lib/wallet/viem";
import { loadWallet } from "@/lib/wallet/storage";
import { approveErc20, supplyToAave } from "@/lib/aave/viem";
import type { AssetId } from "@/lib/types";
import { Address } from "viem";

type SavedRecord = {
  allocations: { id: AssetId; allocation: number }[];
  start: string; end: string; mode: "none" | "periodic" | "threshold";
  periodDays?: number; thresholdPct?: number; initialCapital: number;
};

export default function AavePage() {
  const [chainId, setChainId] = useState<number>(11155111);
  const [portfolios, setPortfolios] = useState<Record<string, SavedRecord>>({});
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const cfg = getAaveConfig(chainId);
  const chain = CHAINS[chainId];
  const rpc = DEFAULT_RPC_BY_CHAIN[chainId];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bt_portfolios");
      setPortfolios(raw ? (JSON.parse(raw) as Record<string, SavedRecord>) : {});
    } catch { setPortfolios({}); }
  }, []);

  const selectedCfg: SavedRecord | null = selected ? portfolios[selected] : null;

  const supportedAssets = useMemo(() => {
    if (!cfg) return new Set<string>();
    return new Set(Object.keys(cfg.reserves));
  }, [cfg]);

  const validation = useMemo(() => {
    if (!selectedCfg) return null;
    const unsupported: string[] = [];
    for (const a of selectedCfg.allocations) {
      const sym = mapAssetIdToAaveSymbol(a.id);
      if (!sym || !supportedAssets.has(sym)) unsupported.push(a.id);
    }
    return { unsupported };
  }, [selectedCfg, supportedAssets]);

  async function deploy() {
    setStatus("");
    if (!cfg) { setStatus("Aave not supported on this chain yet"); return; }
    if (!selectedCfg) { setStatus("Select a portfolio"); return; }
    if (validation && validation.unsupported.length > 0) { setStatus(`Unsupported assets: ${validation.unsupported.join(", ")}`); return; }

    const w = loadWallet();
    if (!w) { setStatus("Unlock or create a wallet in the Wallet page first"); return; }
    const password = prompt("Enter wallet password to sign");
    if (!password) return;
    try {
      const { decryptSecret } = await import("@/lib/wallet/crypto");
      const pk = (await decryptSecret(w.encrypted, password)) as `0x${string}`;
      const pub = buildPublicClient(chain, rpc);
      const wc = buildWalletClient(chain, pk, rpc);

      for (const a of selectedCfg.allocations) {
        const sym = mapAssetIdToAaveSymbol(a.id)!;
        const reserve = cfg.reserves[sym];
        if (!reserve) continue;
        const initialCapital = Number(selectedCfg.initialCapital || 0);
        const isUSDC = sym === "USDC";
        if (!isUSDC) {
          setStatus((s) => s + `\nSkipping ${sym} supply (swap not implemented)`);
          continue;
        }
        const amount = (initialCapital * a.allocation).toFixed(6);
        await approveErc20(pub, wc, reserve.underlying as Address, cfg.pool as Address, amount, 6);
        await supplyToAave(pub, wc, cfg.pool as Address, reserve.underlying as Address, amount, 6);
        setStatus((s) => s + `\nSupplied ${amount} ${sym}`);
      }
      setStatus((s) => s + `\nDone.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Text size="lg" fw={700}>Aave Manager (Sepolia)</Text>
        <Select
          label="Network"
          value={String(chainId)}
          onChange={(v) => setChainId(Number(v))}
          data={Object.values(CHAINS).map((c) => ({ value: String(c.id), label: `${c.name}` }))}
        />
        <Tabs defaultValue="deploy" mt={10}>
          <Tabs.List>
            <Tabs.Tab value="deploy">Deploy Strategy</Tabs.Tab>
            <Tabs.Tab value="borrow">Borrowing</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="deploy" pt="xs">
            <Select
              label="Saved Portfolio"
              value={selected}
              onChange={(v) => setSelected(v || "")}
              data={Object.keys(portfolios).map((k) => ({ value: k, label: k }))}
            />
            {selectedCfg && (
              <Card withBorder shadow="sm" padding="md" mt={10}>
                <Text size="sm" fw={700}>Allocations</Text>
                <Table withTableBorder withColumnBorders mt={6}>
                  <Table.Thead><Table.Tr><Table.Th>Asset</Table.Th><Table.Th>Weight</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {selectedCfg.allocations.map((a) => {
                      const sym = mapAssetIdToAaveSymbol(a.id);
                      const ok = sym && supportedAssets.has(sym);
                      return (
                        <Table.Tr key={a.id}>
                          <Table.Td>{a.id}</Table.Td>
                          <Table.Td>{(a.allocation * 100).toFixed(2)}%</Table.Td>
                          <Table.Td>{ok ? <Badge color="green">Supported</Badge> : <Badge color="red">Unsupported</Badge>}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
                <Button mt={10} onClick={deploy} disabled={!cfg}>Deploy</Button>
              </Card>
            )}
            {status && (
              <Card withBorder shadow="sm" padding="md" mt={10}>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{status}</Text>
              </Card>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="borrow" pt="xs">
            <Text size="sm">Borrowing summary and actions will appear here. Foundation in place to query Aave user data and invoke borrow/repay later.</Text>
          </Tabs.Panel>
        </Tabs>
      </Card>
    </main>
  );
}