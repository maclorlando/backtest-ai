"use client";
import type { EncryptedSecret } from "./crypto";

export type StoredWallet = {
  type: "pk";
  encrypted: EncryptedSecret;
  createdAt: number;
  address?: string; // cached for faster UI
};

const WALLET_KEY = "bt_wallet_v1";

export function saveWallet(w: StoredWallet) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
}

export function loadWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return raw ? (JSON.parse(raw) as StoredWallet) : null;
  } catch {
    return null;
  }
}

export function clearWallet() {
  localStorage.removeItem(WALLET_KEY);
}

export type TrackedToken = { address: string; symbol: string; decimals: number; name?: string };

export function loadTrackedTokens(chainId: number): TrackedToken[] {
  try {
    const raw = localStorage.getItem(`bt_tracked_tokens_${chainId}`);
    return raw ? (JSON.parse(raw) as TrackedToken[]) : [];
  } catch {
    return [];
  }
}

export function saveTrackedTokens(chainId: number, tokens: TrackedToken[]) {
  localStorage.setItem(`bt_tracked_tokens_${chainId}`, JSON.stringify(tokens));
}