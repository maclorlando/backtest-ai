"use client";
import { useEffect, useState } from "react";
import { Card, Text, Button, TextInput, Group, Select, Table } from "@mantine/core";
import { encryptSecret, decryptSecret } from "@/lib/wallet/crypto";
import { loadWallet, saveWallet, clearWallet, loadTrackedTokens, saveTrackedTokens, type TrackedToken } from "@/lib/wallet/storage";
import { createRandomPrivateKey, buildPublicClient, buildWalletClient } from "@/lib/wallet/viem";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { Address, formatEther } from "viem";
import { readErc20Balance, readErc20Metadata } from "@/lib/evm/erc20";
import { fetchCurrentPricesUSD } from "@/lib/prices";

export default function WalletPage() {
  const [chainId, setChainId] = useState<number>(11155111);
  const [password, setPassword] = useState("");
  const [unlockedPk, setUnlockedPk] = useState<`0x${string}` | null>(null);
  const [address, setAddress] = useState<string>("");
  const [tracked, setTracked] = useState<TrackedToken[]>([]);
  const [balances, setBalances] = useState<{ native: string; tokens: Array<{ token: TrackedToken; value: number; raw: bigint }>; usd: number; perTokenUsd: Record<string, number> }>({ native: "0", tokens: [], usd: 0, perTokenUsd: {} });

  const chain = CHAINS[chainId];
  const rpc = DEFAULT_RPC_BY_CHAIN[chainId];

  useEffect(() => {
    setTracked(loadTrackedTokens(chainId));
  }, [chainId]);

  useEffect(() => {
    const stored = loadWallet();
    if (stored?.address) setAddress(stored.address);
  }, []);

  async function createWalletHandler() {
    if (!password) return;
    const pk = createRandomPrivateKey();
    const enc = await encryptSecret(pk, password);
    const wc = buildWalletClient(chain, pk, rpc);
    saveWallet({ type: "pk", encrypted: enc, createdAt: Date.now(), address: wc.account!.address });
    setUnlockedPk(pk);
    setAddress(wc.account!.address);
  }

  async function recoverWalletFromPrivateKey(pkHex: string) {
    if (!password || !pkHex?.startsWith("0x")) return;
    const enc = await encryptSecret(pkHex as `0x${string}`, password);
    const wc = buildWalletClient(chain, pkHex as `0x${string}`, rpc);
    saveWallet({ type: "pk", encrypted: enc, createdAt: Date.now(), address: wc.account!.address });
    setUnlockedPk(pkHex as `0x${string}`);
    setAddress(wc.account!.address);
  }

  async function unlock() {
    const stored = loadWallet();
    if (!stored) return;
    try {
      const pk = (await decryptSecret(stored.encrypted, password)) as `0x${string}`;
      setUnlockedPk(pk);
      setAddress(stored.address || buildWalletClient(chain, pk, rpc).account!.address);
    } catch {
      alert("Invalid password");
    }
  }

  function lock() {
    setUnlockedPk(null);
  }

  function forget() {
    clearWallet();
    setUnlockedPk(null);
    setAddress("");
  }

  async function addToken(addr: string) {
    try {
      const pub = buildPublicClient(chain, rpc);
      const meta = await readErc20Metadata(pub, addr as Address);
      const next: TrackedToken[] = [...tracked, { address: addr, symbol: meta.symbol, decimals: meta.decimals, name: meta.name }];
      setTracked(next);
      saveTrackedTokens(chainId, next);
    } catch {
      alert("Invalid token address or network error");
    }
  }

  async function refreshBalances() {
    try {
      const pub = buildPublicClient(chain, rpc);
      const addr = address as Address;
      const [nativeBal] = await Promise.all([
        pub.getBalance({ address: addr }).catch(() => 0n),
      ]);
      const tokenBalances = await Promise.all(
        tracked.map(async (t) => {
          try {
            const bal = await readErc20Balance(pub, t.address as Address, addr, t.decimals);
            return { token: t, value: bal.value, raw: bal.raw };
          } catch {
            return { token: t, value: 0, raw: 0n };
          }
        })
      );
      // USD pricing by symbol (best-effort)
      const ids: string[] = [];
      const symbolToId: Record<string, string> = {
        USDC: "usd-coin",
        WETH: "ethereum",
        ETH: "ethereum",
        WBTC: "bitcoin",
        AAVE: "aave",
        LINK: "chainlink",
      };
      const syms = Array.from(new Set(tokenBalances.map((x) => x.token.symbol.toUpperCase())));
      for (const s of syms) if (symbolToId[s]) ids.push(symbolToId[s]);
      const apiKey = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
      const px = await fetchCurrentPricesUSD(ids as unknown as ("usd-coin"|"ethereum"|"bitcoin"|"aave"|"chainlink")[], apiKey);
      const perTokenUsd: Record<string, number> = {};
      for (const tb of tokenBalances) {
        const id = symbolToId[tb.token.symbol.toUpperCase()];
        if (id && px[id]) perTokenUsd[tb.token.address] = tb.value * px[id];
      }
      const usd = Object.values(perTokenUsd).reduce((a, b) => a + b, 0);
      setBalances({ native: formatEther(nativeBal), tokens: tokenBalances, usd, perTokenUsd });
    } catch {
      alert("Failed to fetch balances");
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between">
          <Text size="lg" fw={700}>Wallet</Text>
          <Select
            label="Network"
            value={String(chainId)}
            onChange={(v) => setChainId(Number(v))}
            data={Object.values(CHAINS).map((c) => ({ value: String(c.id), label: `${c.name}` }))}
          />
        </Group>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Text size="sm" fw={600}>Create / Recover</Text>
            <TextInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            <Group mt={8}>
              <Button onClick={createWalletHandler} disabled={!password}>Create New</Button>
              <RecoverForm onRecover={recoverWalletFromPrivateKey} disabled={!password} />
            </Group>
          </div>
          <div>
            <Text size="sm" fw={600}>Status</Text>
            <div className="text-sm">Address: {address || "—"}</div>
            <Group mt={8}>
              <Button variant="light" onClick={unlock} disabled={!password}>Unlock</Button>
              <Button variant="light" onClick={lock} disabled={!unlockedPk}>Lock</Button>
              <Button color="red" variant="light" onClick={forget}>Forget</Button>
            </Group>
          </div>
        </div>
      </Card>

      <Card withBorder shadow="sm" padding="lg">
        <Text size="sm" fw={700}>Track Tokens</Text>
        <AddTokenForm onAdd={addToken} />
        <Table mt={8} withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr><Table.Th>Symbol</Table.Th><Table.Th>Address</Table.Th><Table.Th>Decimals</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tracked.map((t) => (
              <Table.Tr key={t.address}><Table.Td>{t.symbol}</Table.Td><Table.Td>{t.address}</Table.Td><Table.Td>{t.decimals}</Table.Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between">
          <Text size="sm" fw={700}>Balances</Text>
          <Button onClick={refreshBalances} disabled={!address}>Refresh</Button>
        </Group>
        <div className="text-sm mt-2">Native: {balances.native} {chain?.nativeCurrency?.symbol || "ETH"}</div>
        <Table mt={8} withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr><Table.Th>Symbol</Table.Th><Table.Th>Balance</Table.Th><Table.Th>USD</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {balances.tokens.map((row) => (
              <Table.Tr key={row.token.address}>
                <Table.Td>{row.token.symbol}</Table.Td>
                <Table.Td>{row.value.toFixed(6)}</Table.Td>
                <Table.Td>{balances.perTokenUsd[row.token.address]?.toFixed(2) || "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <div className="mt-2">Total USD (known tokens): ${balances.usd.toFixed(2)}</div>
      </Card>
    </main>
  );
}

function RecoverForm({ onRecover, disabled }: { onRecover: (pk: string) => void; disabled?: boolean }) {
  const [pk, setPk] = useState("");
  return (
    <Group>
      <TextInput placeholder="0x..private key" value={pk} onChange={(e) => setPk(e.currentTarget.value)} style={{ width: 280 }} />
      <Button onClick={() => onRecover(pk)} disabled={disabled || !pk.startsWith("0x")}>Recover</Button>
    </Group>
  );
}

function AddTokenForm({ onAdd }: { onAdd: (addr: string) => void }) {
  const [addr, setAddr] = useState("");
  return (
    <Group mt={8}>
      <TextInput placeholder="Token address (0x...)" value={addr} onChange={(e) => setAddr(e.currentTarget.value)} style={{ width: 420 }} />
      <Button onClick={() => onAdd(addr)} disabled={!addr.startsWith("0x")}>Add</Button>
    </Group>
  );
}