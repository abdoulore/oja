// Ọjà pricing agent. The autonomous economic actor at the center of the demo.
//
// Loop, once per window:
//   1. Read demand aggregates for the closing window from the indexer
//      (purchases, balks, revenue at the current price). It NEVER sees
//      buyer valuations — only observed behavior.
//   2. Update a UCB1 bandit whose arms are rungs on a price ladder,
//      reward = revenue per window.
//   3. Pick the next price (explore/exploit), push it to the provider's
//      live price store.
//   4. Attest the price change ON-CHAIN through the Rust livenet CLI,
//      committing a sha256 of the window stats that justified it.
//   5. Optionally narrate the decision with an LLM (OpenAI-compatible,
//      DeepSeek by default) for the dashboard.
import "@oja/shared/src/env.ts";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { env, envInt, REPO_ROOT } from "@oja/shared/src/env.ts";
import { motesToTokens } from "@oja/shared/src/x402util.ts";
import type { WindowStats } from "@oja/shared/src/types.ts";

const PROVIDER_URL = env("PROVIDER_URL", "http://localhost:4021");
const INDEXER_URL = env("INDEXER_URL", "http://localhost:4030");
const ADMIN_TOKEN = env("ADMIN_TOKEN");
const REGISTRY_ADDRESS = env("REGISTRY_ADDRESS");
const ATTESTOR_BIN = resolve(REPO_ROOT, env("ATTESTOR_BIN", "./contracts/target/release/attest"));
const WINDOW_SECONDS = envInt("WINDOW_SECONDS", 45);
const EPSILON = Number(env("EXPLORATION_EPSILON", "0.2"));
const LADDER = env("PRICE_LADDER_MOTES", "1000000000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const ENDPOINT_ID = "quote";

// ---------------- UCB1 bandit ----------------
interface ArmState {
  pulls: number;
  totalRewardTokens: number; // revenue in whole tokens for readable stats
}
interface BanditState {
  arms: Record<string, ArmState>; // key = price in motes
  totalPulls: number;
}
const BANDIT_PATH = resolve(REPO_ROOT, "data/bandit.json");

function loadBandit(): BanditState {
  if (existsSync(BANDIT_PATH)) {
    try {
      return JSON.parse(readFileSync(BANDIT_PATH, "utf8"));
    } catch {
      /* fall through */
    }
  }
  const arms: Record<string, ArmState> = {};
  for (const p of LADDER) arms[p] = { pulls: 0, totalRewardTokens: 0 };
  return { arms, totalPulls: 0 };
}
function saveBandit(s: BanditState) {
  mkdirSync(resolve(REPO_ROOT, "data"), { recursive: true });
  writeFileSync(BANDIT_PATH, JSON.stringify(s, null, 2));
}

function selectArm(s: BanditState): string {
  // Untried arms first.
  for (const p of LADDER) if (s.arms[p].pulls === 0) return p;
  // Epsilon exploration keeps the demo lively even after convergence.
  if (Math.random() < EPSILON) {
    return LADDER[Math.floor(Math.random() * LADDER.length)];
  }
  // UCB1.
  let best = LADDER[0];
  let bestScore = -Infinity;
  for (const p of LADDER) {
    const a = s.arms[p];
    const mean = a.totalRewardTokens / a.pulls;
    const bonus = Math.sqrt((2 * Math.log(Math.max(s.totalPulls, 1))) / a.pulls);
    const score = mean + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function updateArm(s: BanditState, price: string, rewardTokens: number) {
  const a = s.arms[price] ?? { pulls: 0, totalRewardTokens: 0 };
  a.pulls += 1;
  a.totalRewardTokens += rewardTokens;
  s.arms[price] = a;
  s.totalPulls += 1;
  saveBandit(s);
}

// ---------------- IO ----------------
async function fetchWindowStats(fromMs: number, toMs: number): Promise<WindowStats> {
  const r = await fetch(
    `${INDEXER_URL}/stats/window?endpoint=${ENDPOINT_ID}&from=${fromMs}&to=${toMs}`,
  );
  if (!r.ok) throw new Error(`indexer stats ${r.status}`);
  return (await r.json()) as WindowStats;
}

async function pushPrice(priceMotes: string) {
  const r = await fetch(`${PROVIDER_URL}/admin/price`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN },
    body: JSON.stringify({ endpointId: ENDPOINT_ID, priceMotes }),
  });
  if (!r.ok) throw new Error(`provider admin ${r.status}: ${await r.text()}`);
}

/** Run the Rust livenet attestor; returns { seq, txHash } best-effort. */
function attestOnChain(
  newPriceMotes: string,
  statsHash: string,
): Promise<{ seq?: number; txHash?: string; ok: boolean; log: string }> {
  return new Promise(resolvePromise => {
    // A .mjs/.js attestor (the Windows-friendly casper-js-sdk port) runs via
    // the current Node executable; anything else is spawned as a binary.
    const attestorArgs = [REGISTRY_ADDRESS, ENDPOINT_ID, newPriceMotes, statsHash];
    const isScript = /\.(mjs|cjs|js)$/i.test(ATTESTOR_BIN);
    const child = spawn(
      isScript ? process.execPath : ATTESTOR_BIN,
      isScript ? [ATTESTOR_BIN, ...attestorArgs] : attestorArgs,
      { cwd: resolve(REPO_ROOT, "contracts"), env: process.env },
    );
    let out = "";
    child.stdout.on("data", d => (out += d.toString()));
    child.stderr.on("data", d => (out += d.toString()));
    child.on("close", code => {
      const seqMatch = out.match(/ATTESTED seq=(\d+)/);
      // The Odra livenet host logs lines like:
      //   WAIT : Waiting ... V1(TransactionV1Hash(<hex>))
      const txMatch =
        out.match(/TransactionV1Hash\(([0-9a-fA-F]{64})\)/) ||
        out.match(/DeployHash\(([0-9a-fA-F]{64})\)/) ||
        out.match(/"([0-9a-fA-F]{64})" successfully executed/);
      resolvePromise({
        ok: code === 0,
        seq: seqMatch ? parseInt(seqMatch[1], 10) : undefined,
        txHash: txMatch ? txMatch[1] : undefined,
        log: out,
      });
    });
    child.on("error", err => resolvePromise({ ok: false, log: String(err) }));
  });
}

async function narrate(stats: WindowStats, oldPrice: string, newPrice: string): Promise<string> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "deepseek-chat";
  const fallback =
    `Window closed at ${motesToTokens(stats.priceMotes)} OJA: ` +
    `${stats.purchases}/${stats.observations} bought, revenue ${motesToTokens(stats.revenueMotes)} OJA. ` +
    (oldPrice === newPrice
      ? `Holding price.`
      : `Moving ${motesToTokens(oldPrice)} -> ${motesToTokens(newPrice)} to probe the demand curve.`);
  if (!base || !key) return fallback;
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 90,
        messages: [
          {
            role: "system",
            content:
              "You are the pricing agent for a pay-per-request API. In one plain sentence, " +
              "explain the price decision from the stats. No hedging, no emojis.",
          },
          {
            role: "user",
            content: JSON.stringify({ stats, oldPrice, newPrice }),
          },
        ],
      }),
    });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function reportAttestation(body: unknown) {
  try {
    await fetch(`${INDEXER_URL}/report/attestation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}

// ---------------- main loop ----------------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!existsSync(ATTESTOR_BIN)) {
    console.warn(
      `[pricing-agent] attestor binary not found at ${ATTESTOR_BIN}.\n` +
        `  Build it first: cd contracts && cargo build --release --features livenet --bin attest\n` +
        `  Running in DRY-RUN mode: prices will move but attestations will be skipped.`,
    );
  }
  const bandit = loadBandit();
  let currentPrice = LADDER[Math.min(1, LADDER.length - 1)];
  await pushPrice(currentPrice);
  console.log(
    `[pricing-agent] ladder=[${LADDER.map(p => motesToTokens(p)).join(", ")}] OJA, ` +
      `window=${WINDOW_SECONDS}s, start=${motesToTokens(currentPrice)}`,
  );

  for (;;) {
    const fromMs = Date.now();
    await sleep(WINDOW_SECONDS * 1000);
    const toMs = Date.now();

    let stats: WindowStats;
    try {
      stats = await fetchWindowStats(fromMs, toMs);
    } catch (e) {
      console.warn("[pricing-agent] indexer unavailable, skipping window", e);
      continue;
    }

    const rewardTokens = Number(motesToTokens(stats.revenueMotes));
    updateArm(bandit, currentPrice, rewardTokens);

    const nextPrice = selectArm(bandit);
    const statsHash = createHash("sha256")
      .update(JSON.stringify(stats))
      .digest("hex");
    const narration = await narrate(stats, currentPrice, nextPrice);
    console.log(`[pricing-agent] ${narration}`);

    const oldPrice = currentPrice;
    if (nextPrice !== currentPrice) {
      await pushPrice(nextPrice);
      currentPrice = nextPrice;
    }

    let seq: number | undefined;
    let txHash: string | undefined;
    if (existsSync(ATTESTOR_BIN)) {
      const res = await attestOnChain(currentPrice, statsHash);
      seq = res.seq;
      txHash = res.txHash;
      if (!res.ok) console.warn("[pricing-agent] attestation failed:\n" + res.log.slice(-800));
      else console.log(`[pricing-agent] attested on-chain seq=${seq} tx=${txHash ?? "?"}`);
    }

    await reportAttestation({
      endpointId: ENDPOINT_ID,
      oldPriceMotes: oldPrice,
      newPriceMotes: currentPrice,
      statsHash,
      seq,
      txHash,
      narration,
      windowStats: stats,
      at: Date.now(),
    });
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
