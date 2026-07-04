// Ọjà indexer. Single source of truth the pricing agent and dashboard read.
// Stores buyer purchase/balk reports, provider settlement reports, and
// pricing-agent attestations in SQLite; confirms transaction hashes against
// the Casper testnet RPC so nothing on the dashboard is trusted from a
// self-report alone.
import "@oja/shared/src/env.ts";
import cors from "cors";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { env, envInt, REPO_ROOT } from "@oja/shared/src/env.ts";

const PORT = envInt("INDEXER_PORT", 4030);
const DB_PATH = resolve(REPO_ROOT, env("DB_PATH", "./data/oja.sqlite"));
const RPC_URL = env("RPC_URL", "https://node.testnet.casper.network/rpc");

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id TEXT,
  endpoint_id TEXT NOT NULL,
  price_motes TEXT NOT NULL,
  valuation_motes TEXT,
  tx_hash TEXT UNIQUE,
  network TEXT,
  confirmed INTEGER DEFAULT 0,
  raw TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS balks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id TEXT,
  endpoint_id TEXT NOT NULL,
  price_motes TEXT NOT NULL,
  valuation_motes TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attestations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id TEXT NOT NULL,
  old_price_motes TEXT NOT NULL,
  new_price_motes TEXT NOT NULL,
  stats_hash TEXT NOT NULL,
  seq INTEGER,
  tx_hash TEXT,
  narration TEXT,
  window_stats TEXT,
  confirmed INTEGER DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS controls (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "512kb" }));

// ---------------- reports ----------------
app.post("/report/purchase", (req, res) => {
  const b = req.body ?? {};
  try {
    db.prepare(
      `INSERT INTO purchases (buyer_id, endpoint_id, price_motes, valuation_motes, tx_hash, network, raw, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tx_hash) DO UPDATE SET
         buyer_id=COALESCE(excluded.buyer_id, purchases.buyer_id),
         valuation_motes=COALESCE(excluded.valuation_motes, purchases.valuation_motes)`,
    ).run(
      b.buyerId ?? null,
      String(b.endpointId ?? "unknown"),
      String(b.priceMotes ?? "0"),
      b.valuationMotes ?? null,
      b.txHash ?? null,
      b.network ?? null,
      b.raw ? JSON.stringify(b.raw) : null,
      Number(b.at ?? Date.now()),
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// Provider-side settlement record: merge into purchases by tx hash if we can
// extract one, otherwise store as an anonymous purchase.
app.post("/report/settlement", (req, res) => {
  const b = req.body ?? {};
  const settle = b.settle ?? {};
  const tx =
    settle.transaction ?? settle.txHash ?? settle.transactionHash ?? settle.deployHash ?? null;
  try {
    db.prepare(
      `INSERT INTO purchases (buyer_id, endpoint_id, price_motes, tx_hash, network, raw, at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tx_hash) DO NOTHING`,
    ).run(
      String(b.endpointId ?? "unknown"),
      String(b.priceMotes ?? "0"),
      tx,
      settle.network ?? null,
      JSON.stringify(settle),
      Number(b.at ?? Date.now()),
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/report/balk", (req, res) => {
  const b = req.body ?? {};
  db.prepare(
    `INSERT INTO balks (buyer_id, endpoint_id, price_motes, valuation_motes, at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    b.buyerId ?? null,
    String(b.endpointId ?? "unknown"),
    String(b.priceMotes ?? "0"),
    String(b.valuationMotes ?? "0"),
    Number(b.at ?? Date.now()),
  );
  res.json({ ok: true });
});

app.post("/report/attestation", (req, res) => {
  const b = req.body ?? {};
  db.prepare(
    `INSERT INTO attestations (endpoint_id, old_price_motes, new_price_motes, stats_hash, seq, tx_hash, narration, window_stats, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    String(b.endpointId ?? "unknown"),
    String(b.oldPriceMotes ?? "0"),
    String(b.newPriceMotes ?? "0"),
    String(b.statsHash ?? ""),
    b.seq ?? null,
    b.txHash ?? null,
    b.narration ?? null,
    b.windowStats ? JSON.stringify(b.windowStats) : null,
    Number(b.at ?? Date.now()),
  );
  res.json({ ok: true });
});

// ---------------- reads ----------------
app.get("/stats/window", (req, res) => {
  const endpoint = String(req.query.endpoint ?? "quote");
  const from = Number(req.query.from ?? 0);
  const to = Number(req.query.to ?? Date.now());
  const p = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CAST(price_motes AS INTEGER)),0) AS rev,
              MAX(price_motes) AS price
       FROM purchases WHERE endpoint_id=? AND at>=? AND at<?`,
    )
    .get(endpoint, from, to) as { n: number; rev: number; price: string | null };
  const bk = db
    .prepare(`SELECT COUNT(*) AS n, MAX(price_motes) AS price FROM balks WHERE endpoint_id=? AND at>=? AND at<?`)
    .get(endpoint, from, to) as { n: number; price: string | null };
  res.json({
    endpointId: endpoint,
    fromMs: from,
    toMs: to,
    priceMotes: p.price ?? bk.price ?? "0",
    observations: p.n + bk.n,
    purchases: p.n,
    balks: bk.n,
    revenueMotes: String(p.rev),
  });
});

app.get("/feed", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 60), 200);
  const purchases = db
    .prepare(
      `SELECT 'purchase' AS kind, buyer_id, endpoint_id, price_motes, tx_hash, confirmed, at
       FROM purchases ORDER BY at DESC LIMIT ?`,
    )
    .all(limit);
  const balks = db
    .prepare(
      `SELECT 'balk' AS kind, buyer_id, endpoint_id, price_motes, valuation_motes, at
       FROM balks ORDER BY at DESC LIMIT ?`,
    )
    .all(limit);
  const atts = db
    .prepare(
      `SELECT 'attestation' AS kind, endpoint_id, old_price_motes, new_price_motes, stats_hash,
              seq, tx_hash, narration, window_stats, confirmed, at
       FROM attestations ORDER BY at DESC LIMIT ?`,
    )
    .all(limit);
  const merged = [...purchases, ...balks, ...atts]
    .sort((a: any, b: any) => b.at - a.at)
    .slice(0, limit);
  res.json({ events: merged });
});

app.get("/summary", (_req, res) => {
  const totals = db
    .prepare(
      `SELECT endpoint_id,
              COUNT(*) AS purchases,
              COALESCE(SUM(CAST(price_motes AS INTEGER)),0) AS revenue,
              SUM(confirmed) AS confirmed
       FROM purchases GROUP BY endpoint_id`,
    )
    .all();
  const balks = db
    .prepare(`SELECT endpoint_id, COUNT(*) AS balks FROM balks GROUP BY endpoint_id`)
    .all();
  const attest = db
    .prepare(
      `SELECT endpoint_id, COUNT(*) AS attestations, SUM(confirmed) AS confirmed
       FROM attestations GROUP BY endpoint_id`,
    )
    .all();
  const series = db
    .prepare(
      `SELECT at, new_price_motes AS price, seq, tx_hash FROM attestations
       WHERE endpoint_id='quote' ORDER BY at ASC LIMIT 500`,
    )
    .all();
  const shock = db.prepare(`SELECT value FROM controls WHERE key='shockMultiplier'`).get() as
    | { value: string }
    | undefined;
  res.json({
    totals,
    balks,
    attest,
    priceSeries: series,
    shockMultiplier: shock ? Number(shock.value) : 1,
  });
});

// ---------------- demand shock control ----------------
app.get("/control", (_req, res) => {
  const shock = db.prepare(`SELECT value FROM controls WHERE key='shockMultiplier'`).get() as
    | { value: string }
    | undefined;
  res.json({ shockMultiplier: shock ? Number(shock.value) : 1 });
});

app.post("/control/shock", (req, res) => {
  const m = Number((req.body ?? {}).multiplier ?? 1);
  if (!(m > 0 && m < 100)) return res.status(400).json({ error: "multiplier out of range" });
  db.prepare(
    `INSERT INTO controls (key, value) VALUES ('shockMultiplier', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(String(m));
  console.log(`[indexer] demand shock multiplier set to ${m}`);
  res.json({ ok: true, shockMultiplier: m });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ---------------- on-chain confirmation worker ----------------
// A tx hash self-reported by a buyer is only marked confirmed once the
// testnet RPC agrees it executed. Tries Casper 2.x info_get_transaction
// first, falls back to legacy info_get_deploy.
async function rpc(method: string, params: unknown): Promise<any> {
  const r = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

async function confirmOne(table: "purchases" | "attestations", id: number, tx: string) {
  try {
    let ok = false;
    const v2 = await rpc("info_get_transaction", {
      transaction_hash: { Version1: tx },
    });
    if (v2?.result?.execution_info || v2?.result?.transaction) ok = !v2?.result?.execution_info?.execution_result?.Failure;
    if (!ok) {
      const v1 = await rpc("info_get_deploy", { deploy_hash: tx });
      if (v1?.result?.execution_results?.length || v1?.result?.execution_info) ok = true;
    }
    if (ok) {
      db.prepare(`UPDATE ${table} SET confirmed=1 WHERE id=?`).run(id);
      console.log(`[indexer] confirmed ${table} tx=${tx.slice(0, 12)}…`);
    }
  } catch {
    /* leave unconfirmed; retried next sweep */
  }
}

setInterval(() => {
  const rows = db
    .prepare(
      `SELECT id, tx_hash FROM purchases WHERE confirmed=0 AND tx_hash IS NOT NULL ORDER BY at DESC LIMIT 10`,
    )
    .all() as { id: number; tx_hash: string }[];
  for (const r of rows) void confirmOne("purchases", r.id, r.tx_hash);
  const arows = db
    .prepare(
      `SELECT id, tx_hash FROM attestations WHERE confirmed=0 AND tx_hash IS NOT NULL ORDER BY at DESC LIMIT 10`,
    )
    .all() as { id: number; tx_hash: string }[];
  for (const r of arows) void confirmOne("attestations", r.id, r.tx_hash);
}, 20_000);

app.listen(PORT, () => console.log(`[indexer] listening on http://localhost:${PORT}`));
