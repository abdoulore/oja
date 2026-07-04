// Shared helpers for the Node livenet CLI (Windows-friendly port of the Rust
// livenet bins, which cannot compile on Windows because casper-types uses
// Unix-only libc APIs). Same wire behavior: TransactionV1 via casper-js-sdk.
import casperSdk from "casper-js-sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const {
  RpcClient,
  HttpHandler,
  PrivateKey,
  KeyAlgorithm,
  PublicKey,
  AccountIdentifier,
} = casperSdk;

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(ROOT, ".env") });

export const CHAIN = process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || "casper-test";
export const RPC_URL = process.env.RPC_URL || "https://node.testnet.casper.network/rpc";

export const sdk = casperSdk;

export function rpcClient() {
  return new RpcClient(new HttpHandler(RPC_URL));
}

export function loadDeployer() {
  const keyPath = resolve(
    ROOT,
    process.env.ODRA_CASPER_LIVENET_SECRET_KEY_PATH || "./keys/deployer/secret_key.pem",
  );
  const pem = readFileSync(keyPath, "utf8");
  return PrivateKey.fromPem(pem, KeyAlgorithm.ED25519);
}

/** Accepts hash-..., contract-package-..., package-..., or bare 64-hex. */
export function stripHash(value) {
  const m = String(value).trim().match(/([0-9a-fA-F]{64})$/);
  if (!m) throw new Error(`cannot parse a 32-byte hash from '${value}'`);
  return m[1].toLowerCase();
}

/** Recipient may be account-hash-..., a 64-hex account hash, or a public key hex. */
export function toAccountHashHex(recipient) {
  const r = String(recipient).trim();
  if (r.startsWith("account-hash-")) return r.slice("account-hash-".length).toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(r)) return r.toLowerCase();
  if (/^0[12][0-9a-fA-F]{64,66}$/.test(r)) {
    return PublicKey.fromHex(r).accountHash().toHex().toLowerCase();
  }
  throw new Error(`cannot parse recipient '${r}': pass account-hash-..., 64-hex, or a public key hex`);
}

/**
 * Submit a signed transaction and poll until executed.
 * Prints "TransactionV1Hash(<hex>)" — the exact shape the pricing agent's
 * log regex expects — and throws if execution reports an error.
 */
export async function submitAndWait(client, transaction, { timeoutMs = 240_000, label = "tx" } = {}) {
  const res = await client.putTransaction(transaction);
  const hash = res.transactionHash.toHex();
  console.log(`SUBMITTED ${label} TransactionV1Hash(${hash})`);
  console.log(`  https://testnet.cspr.live/transaction/${hash}`);
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${hash}`);
    }
    await new Promise(r => setTimeout(r, 4000));
    let info;
    try {
      info = await client.getTransactionByTransactionHash(hash);
    } catch {
      continue; // not visible yet
    }
    const exec = info?.executionInfo;
    if (exec && exec.blockHeight !== 0 && exec.executionResult) {
      const err = exec.executionResult.errorMessage;
      if (err) throw new Error(`execution failed for ${hash}: ${err}`);
      console.log(`EXECUTED ${label} (block ${exec.blockHeight})`);
      return hash;
    }
  }
}

/** Read a named key (as bare 64-hex) from the deployer's account. */
export async function readNamedKeyHash(client, publicKey, keyName) {
  const ident = new AccountIdentifier(undefined, publicKey);
  const info = await client.getAccountInfo(null, ident);
  const namedKeys = info?.account?.namedKeys ?? [];
  for (const nk of namedKeys) {
    if (nk.name === keyName) {
      const raw =
        typeof nk.key === "string"
          ? nk.key
          : (nk.key?.toPrefixedString?.() ?? nk.key?.toString?.() ?? JSON.stringify(nk.key));
      return stripHash(raw);
    }
  }
  const available = namedKeys.map(nk => nk.name).join(", ") || "(none)";
  throw new Error(`named key '${keyName}' not found on deployer account; available: ${available}`);
}

/** Upsert NAME=value in the repo .env so later steps pick it up automatically. */
export function updateEnv(name, value) {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  const line = `${name}=${value}`;
  const re = new RegExp(`^#?\\s*${name}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : text + `\n${line}\n`;
  writeFileSync(envPath, text);
  console.log(`.env updated: ${line}`);
}
