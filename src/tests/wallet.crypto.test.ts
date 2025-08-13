import { describe, it, expect } from "vitest";

// Ensure a minimal WebCrypto is present for the test
if (typeof globalThis.crypto === "undefined") {
  // @ts-ignore
  globalThis.crypto = require("node:crypto").webcrypto;
}

import { encryptSecret, decryptSecret } from "@/lib/wallet/crypto";

describe("wallet crypto", () => {
  it("roundtrips encryption/decryption", async () => {
    const secret = "0xabc123";
    const enc = await encryptSecret(secret, "pass");
    const dec = await decryptSecret(enc, "pass");
    expect(dec).toBe(secret);
  });
});