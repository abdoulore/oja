// Ọjà buyer fleet. Each buyer is an autonomous agent with a HIDDEN valuation
// for the service. On each tick it asks the provider for a quote (a plain
// request that returns 402 + PAYMENT-REQUIRED), compares the quoted price to
// its valuation, and either pays for real over x402 (settling on Casper
// testnet) or balks. Purchases AND balks are reported to the indexer; the
// pricing agent only ever sees those aggregates, never the valuations.
import "@oja/shared/src/env.ts";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import casperSdk from "casper-js-sdk";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import type { PaymentRequirements } from "@x402/core/types";
import { createClientCasperSigner } from "@make-software/casper-x402";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";
import { env, envInt, REPO_ROOT } from "@oja/shared/src/env.ts";
import { decodePaymentRequired, extractTxHash, motesToTokens } from "@oja/shared/src/x402util.ts";

const { KeyAlgorithm } = casperSdk;

const PROVIDER_URL = env("PROVIDER_URL", "http://localhost:4021");
const INDEXER_URL = env("INDEXER_URL", "http://localhost:4030");
const KEYS_DIR = resolve(REPO_ROOT, env("BUYER_KEYS_DIR", "./keys/buyers"));
const BUYER_COUNT = envInt("BUYER_COUNT", 6);
const MEAN_VALUATION = BigInt(env("BUYER_MEAN_VALUATION_MOTES", "4000000000"));
const TICK_MS = envInt("BUYER_TICK_MS", 6000);
const ENDPOINT = { id: "quote", path: "/api/quote" };

// ---------------- helpers ----------------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const jitter = (ms: number) => ms * (0.5 + Math.random());

/** Log-normal-ish valuation around the mean, so the fleet has a demand curve. */
function drawValuation(): bigint {
  const z = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8; // ~N(0,0.8)
  const mult = Math.exp(z);
  const v = (MEAN_VALUATION * BigInt(Math.round(mult * 1000))) / 1000n;
  return v < 1n ? 1n : v;
}

async function report(path: string, body: unknown) {
  try {
    await fetch(`${INDEXER_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* indexer being down must not stop the market */
  }
}

async function currentShockMultiplier(): Promise<number> {
  try {
    const r = await fetch(`${INDEXER_URL}/control`);
    const j = (await r.json()) as { shockMultiplier?: number };
    return typeof j.shockMultiplier === "number" ? j.shockMultiplier : 1;
  } catch {
    return 1;
  }
}

// ---------------- buyer ----------------
interface Buyer {
  id: string;
  valuation: bigint;
  fetchPaid: typeof fetch;
  httpClient: x402HTTPClient;
}

async function makeBuyer(keyPath: string, idx: number): Promise<Buyer> {
  const signer = await createClientCasperSigner(keyPath, KeyAlgorithm.ED25519);
  const client = new x402Client((_v: number, options: PaymentRequirements[]) => options[0]).register(
    "casper:*",
    new ExactCasperScheme(signer),
  );
  return {
    id: `buyer-${idx}`,
    valuation: drawValuation(),
    fetchPaid: wrapFetchWithPayment(fetch, client),
    httpClient: new x402HTTPClient(client),
  };
}

async function tick(buyer: Buyer) {
  const url = `${PROVIDER_URL}${ENDPOINT.path}`;

  // 1) Ask the price without paying.
  const probe = await fetch(url);
  if (probe.status !== 402) {
    // Free or error; nothing to learn from.
    return;
  }
  const quoted = decodePaymentRequired(probe.headers.get("PAYMENT-REQUIRED"));
  if (!quoted) {
    console.warn(`[${buyer.id}] could not decode PAYMENT-REQUIRED header`);
    return;
  }
  const price = BigInt(quoted.maxAmountRequired);
  const shock = await currentShockMultiplier();
  const effectiveValuation =
    (buyer.valuation * BigInt(Math.round(shock * 1000))) / 1000n;

  // 2) Buy or balk.
  if (price > effectiveValuation) {
    console.log(
      `[${buyer.id}] balk  price=${motesToTokens(price)} > val=${motesToTokens(effectiveValuation)}`,
    );
    await report("/report/balk", {
      buyerId: buyer.id,
      endpointId: ENDPOINT.id,
      priceMotes: price.toString(),
      valuationMotes: effectiveValuation.toString(),
      at: Date.now(),
    });
    return;
  }

  try {
    const res = await buyer.fetchPaid(url, { method: "GET" });
    const settle = buyer.httpClient.getPaymentSettleResponse(name => res.headers.get(name));
    const txHash = extractTxHash(settle);
    console.log(
      `[${buyer.id}] PAID ${motesToTokens(price)} OJA  tx=${txHash ?? "?"}  status=${res.status}`,
    );
    await report("/report/purchase", {
      buyerId: buyer.id,
      endpointId: ENDPOINT.id,
      priceMotes: price.toString(),
      valuationMotes: effectiveValuation.toString(),
      txHash,
      network: quoted.network,
      raw: settle ?? null,
      at: Date.now(),
    });
  } catch (err) {
    console.warn(`[${buyer.id}] payment failed:`, err instanceof Error ? err.message : err);
  }
}

// ---------------- fleet ----------------
async function main() {
  if (!existsSync(KEYS_DIR)) {
    console.error(
      `Buyer keys dir ${KEYS_DIR} not found. Run: node scripts/keygen.mjs (see README).`,
    );
    process.exit(1);
  }
  const dirs = readdirSync(KEYS_DIR)
    .filter(d => d.startsWith("buyer-"))
    .sort()
    .slice(0, BUYER_COUNT);
  if (dirs.length === 0) {
    console.error(`No buyer-* key folders in ${KEYS_DIR}. Run scripts/keygen.mjs first.`);
    process.exit(1);
  }

  const buyers: Buyer[] = [];
  for (let i = 0; i < dirs.length; i++) {
    const keyPath = resolve(KEYS_DIR, dirs[i], "secret_key.pem");
    const b = await makeBuyer(keyPath, i + 1);
    buyers.push(b);
    console.log(`[fleet] ${b.id} online, hidden valuation=${motesToTokens(b.valuation)} OJA`);
  }

  console.log(`[fleet] ${buyers.length} buyers ticking every ~${TICK_MS}ms against ${PROVIDER_URL}`);
  await Promise.all(
    buyers.map(async b => {
      // Desynchronize the fleet.
      await sleep(Math.random() * TICK_MS);
      for (;;) {
        await tick(b).catch(e => console.warn(`[${b.id}] tick error`, e));
        await sleep(jitter(TICK_MS));
      }
    }),
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
