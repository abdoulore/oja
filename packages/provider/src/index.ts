// Ọjà provider: x402-paywalled API whose prices are set live by the
// autonomous pricing agent. Wiring mirrors the official
// make-software/casper-x402 server example, with one twist: the money
// parser is async and reads the CURRENT price from the PriceStore on every
// request, so the pricing agent can move prices without restarts.
import "@oja/shared/src/env.ts";
import cors from "cors";
import express from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/server";
import { HTTPFacilitatorClient, type FacilitatorConfig } from "@x402/core/server";
import type { AssetAmount, Network } from "@x402/core/types";
import { env, envInt, REPO_ROOT } from "@oja/shared/src/env.ts";

// ---------------- Config ----------------
const PORT = envInt("PROVIDER_PORT", 4021);
const PAYEE = env("PAYEE_ADDRESS");
const FACILITATOR_URL = env("FACILITATOR_URL", "http://localhost:4022");
const FACILITATOR_API_KEY = process.env.FACILITATOR_API_KEY || "";
const CHAIN_ID = env("CAIP2_CHAIN_ID", "casper:casper-test") as Network;
const TOKEN_PACKAGE = env("TOKEN_PACKAGE_HASH").replace(/^hash-/, "");
const TOKEN_NAME = env("TOKEN_NAME", "OjaToken");
const TOKEN_SYMBOL = env("TOKEN_SYMBOL", "OJA");
const TOKEN_DECIMALS = envInt("TOKEN_DECIMALS", 9);
const ADMIN_TOKEN = env("ADMIN_TOKEN");
const INDEXER_URL = env("INDEXER_URL", "http://localhost:4030");
const LADDER = env("PRICE_LADDER_MOTES", "1000000000")
  .split(",")
  .map(s => s.trim());

// ---------------- Endpoint catalogue ----------------
// Three demo services with different value profiles. Buyers value them
// differently, which is what gives the pricing agent a demand curve to learn.
export const ENDPOINTS = [
  { id: "quote", path: "/api/quote", description: "Live synthetic market quote" },
  { id: "insight", path: "/api/insight", description: "One-paragraph market insight" },
  { id: "heavy", path: "/api/heavy", description: "Batch analytics computation" },
] as const;
type EndpointId = (typeof ENDPOINTS)[number]["id"];

// ---------------- Live price store ----------------
// Persisted to data/prices.json so restarts keep the learned prices.
const PRICES_PATH = resolve(REPO_ROOT, "data/prices.json");
class PriceStore {
  private prices: Record<string, string> = {};
  constructor() {
    mkdirSync(resolve(REPO_ROOT, "data"), { recursive: true });
    if (existsSync(PRICES_PATH)) {
      try {
        this.prices = JSON.parse(readFileSync(PRICES_PATH, "utf8"));
      } catch {
        this.prices = {};
      }
    }
    for (const e of ENDPOINTS) {
      if (!this.prices[e.id]) this.prices[e.id] = LADDER[Math.min(1, LADDER.length - 1)];
    }
    this.flush();
  }
  get(id: string): string {
    return this.prices[id] ?? LADDER[0];
  }
  set(id: string, motes: string) {
    this.prices[id] = motes;
    this.flush();
  }
  all(): Record<string, string> {
    return { ...this.prices };
  }
  private flush() {
    writeFileSync(PRICES_PATH, JSON.stringify(this.prices, null, 2));
  }
}
const store = new PriceStore();

// ---------------- x402 wiring ----------------
const facilitatorConfig: FacilitatorConfig = { url: FACILITATOR_URL };
if (FACILITATOR_API_KEY) {
  const auth = { Authorization: FACILITATOR_API_KEY };
  facilitatorConfig.createAuthHeaders = async () => ({
    verify: auth,
    settle: auth,
    supported: auth,
    bazaar: auth,
  });
}
const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);

// parsePrice() passes objects with an `amount` field straight through
// (validating only the asset). We exploit that: each route's price is an
// AssetAmount whose `amount` is a GETTER reading the live store, so every
// incoming request is quoted at the pricing agent's current price. This is
// the dynamic pricing mechanism.
function livePrice(endpointId: string): AssetAmount {
  return {
    asset: TOKEN_PACKAGE,
    get amount(): string {
      return store.get(endpointId);
    },
    extra: {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      version: "1",
      decimals: String(TOKEN_DECIMALS),
    },
  } as AssetAmount;
}

const casperScheme = new ExactCasperScheme().registerAsset(
  CHAIN_ID,
  TOKEN_PACKAGE,
  TOKEN_DECIMALS,
);

const routeConfig: Record<string, unknown> = {};
for (const e of ENDPOINTS) {
  routeConfig[`GET ${e.path}`] = {
    accepts: [
      {
        scheme: "exact",
        price: livePrice(e.id),
        network: CHAIN_ID,
        payTo: PAYEE,
      },
    ],
    description: e.description,
    mimeType: "application/json",
  };
}

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type", "Origin", "Payment-Signature"],
    exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
    maxAge: 24 * 60 * 60,
  }),
);
app.use(express.json());

// Public, unpaid routes must be registered BEFORE the payment middleware.
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/prices", (_req, res) => res.json({ prices: store.all(), token: TOKEN_SYMBOL }));

// Pricing-agent control surface.
app.post("/admin/price", (req, res) => {
  if (req.header("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "bad admin token" });
  }
  const { endpointId, priceMotes } = req.body as { endpointId?: string; priceMotes?: string };
  if (!endpointId || !priceMotes || !/^\d+$/.test(priceMotes)) {
    return res.status(400).json({ error: "endpointId and integer priceMotes required" });
  }
  if (!ENDPOINTS.some(e => e.id === endpointId)) {
    return res.status(404).json({ error: "unknown endpoint" });
  }
  const old = store.get(endpointId);
  store.set(endpointId, priceMotes);
  console.log(`[provider] price ${endpointId}: ${old} -> ${priceMotes}`);
  res.json({ ok: true, endpointId, old, new: priceMotes });
});

// The resource server pulls /supported from the facilitator during init, so
// the facilitator must be reachable first. Retry instead of crashing: this
// makes `npm run demo` boot-order proof.
async function waitForFacilitator(maxTries = 30, delayMs = 1500): Promise<void> {
  for (let i = 1; i <= maxTries; i++) {
    try {
      const r = await fetch(`${FACILITATOR_URL}/supported`, {
        signal: AbortSignal.timeout(3000),
        headers: FACILITATOR_API_KEY ? { Authorization: FACILITATOR_API_KEY } : undefined,
      });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (i === 1) console.log(`[provider] waiting for facilitator at ${FACILITATOR_URL} ...`);
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`facilitator unreachable at ${FACILITATOR_URL} after ${maxTries} tries`);
}

await waitForFacilitator();
app.use(
  paymentMiddleware(
    routeConfig as never,
    new x402ResourceServer(facilitatorClient).register(CHAIN_ID, casperScheme),
  ),
);

// ---------------- Paid handlers ----------------
// After the middleware settles a payment it forwards the request here with a
// PAYMENT-RESPONSE header already set on the response. We report that
// settlement to the indexer (authoritative, server-side record).
function reportSettlement(endpointId: EndpointId, res: express.Response) {
  try {
    const header = res.getHeader("PAYMENT-RESPONSE");
    if (!header) return;
    const decoded = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
    void fetch(`${INDEXER_URL}/report/settlement`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpointId,
        priceMotes: store.get(endpointId),
        settle: decoded,
        at: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    /* reporting must never break the paid response */
  }
}

app.get("/api/quote", (_req, res) => {
  const mid = 0.021 + Math.random() * 0.004;
  reportSettlement("quote", res);
  res.json({
    pair: "CSPR/USD",
    bid: +(mid - 0.0004).toFixed(5),
    ask: +(mid + 0.0004).toFixed(5),
    ts: new Date().toISOString(),
  });
});

app.get("/api/insight", (_req, res) => {
  reportSettlement("insight", res);
  res.json({
    insight:
      "Settlement volume on casper-test is trending upward this window; " +
      "agents are price-sensitive below the 3-token line and inelastic above 8.",
    confidence: +(0.6 + Math.random() * 0.3).toFixed(2),
    ts: new Date().toISOString(),
  });
});

app.get("/api/heavy", (_req, res) => {
  const rows = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    volume: Math.round(1_000 + Math.random() * 9_000),
  }));
  reportSettlement("heavy", res);
  res.json({ series: rows, computedIn: "412ms", ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[provider] listening on http://localhost:${PORT}`);
  console.log(`[provider] endpoints:`, ENDPOINTS.map(e => `${e.path} (${e.id})`).join(", "));
  console.log(`[provider] prices:`, store.all());
});
