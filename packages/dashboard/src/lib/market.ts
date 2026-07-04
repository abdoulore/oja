// Shared market data layer: polls the indexer + provider, falls back to a
// bundled replay of a real casper-test session when the local stack is down.
import { useEffect, useMemo, useState } from "react";
import replay from "../data/replay.json";

export const INDEXER = import.meta.env.VITE_INDEXER_URL || "http://localhost:4030";
export const PROVIDER = import.meta.env.VITE_PROVIDER_URL || "http://localhost:4021";
export const EXPLORER_TX = import.meta.env.VITE_EXPLORER_TX || "https://testnet.cspr.live/transaction/";
export const EXPLORER_PKG =
  import.meta.env.VITE_EXPLORER_PKG || "https://testnet.cspr.live/contract-package/";

// Deployed casper-test artifacts (overridable per deployment).
export const REGISTRY_PACKAGE =
  import.meta.env.VITE_REGISTRY_PACKAGE ||
  "3d559a62f46f789325df56459e2621ca7ffe9d933087c9140745ce08e7da78ec";
export const TOKEN_PACKAGE =
  import.meta.env.VITE_TOKEN_PACKAGE ||
  "b57ab2106db957d8dab612bb0c82a91f5ad3b31ffddfdbdfeaae6bc233639c19";

const DECIMALS = 9;

export function tokens(motes: string | number | null | undefined): number {
  if (motes === null || motes === undefined) return 0;
  return Number(motes) / 10 ** DECIMALS;
}

export function fmt(n: number, dp = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

export interface FeedEvent {
  kind: "purchase" | "balk" | "attestation";
  buyer_id?: string;
  endpoint_id: string;
  price_motes?: string;
  valuation_motes?: string;
  old_price_motes?: string;
  new_price_motes?: string;
  narration?: string | null;
  window_stats?: string | null;
  seq?: number | null;
  tx_hash?: string;
  confirmed?: number;
  at: number;
}

/** Demand-window aggregates the agent committed to on-chain (sha256 in stats_hash). */
export interface WindowStats {
  priceMotes: string;
  observations: number;
  purchases: number;
  balks: number;
  revenueMotes: string;
}

export function parseWindowStats(e: FeedEvent): WindowStats | null {
  if (!e.window_stats) return null;
  try {
    return JSON.parse(e.window_stats) as WindowStats;
  } catch {
    return null;
  }
}

export interface Summary {
  totals: { endpoint_id: string; purchases: number; revenue: number; confirmed: number }[];
  balks: { endpoint_id: string; balks: number }[];
  attest: { endpoint_id: string; attestations: number; confirmed: number }[];
  priceSeries: { at: number; price: string; seq: number | null; tx_hash?: string }[];
  shockMultiplier: number;
}

export interface MarketData {
  summary: Summary;
  feed: FeedEvent[];
  prices: Record<string, string>;
  live: boolean; // false = showing the bundled replay
}

const REPLAY: Pick<MarketData, "summary" | "feed"> = {
  summary: replay.summary as unknown as Summary,
  feed: replay.feed as unknown as FeedEvent[],
};

// Only poll the local stack when the page itself is served from localhost, or
// when a public data URL is configured explicitly. A deployed page probing a
// visitor's localhost triggers the browser's local-network permission prompt.
const CAN_POLL =
  typeof window === "undefined" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
  Boolean(import.meta.env.VITE_INDEXER_URL);

export function useMarketData(pollMs = 3000): MarketData {
  const [data, setData] = useState<MarketData>({
    ...REPLAY,
    prices: {},
    live: false,
  });

  useEffect(() => {
    if (!CAN_POLL) return;
    let alive = true;
    async function poll() {
      try {
        const [s, f, p] = await Promise.all([
          fetch(`${INDEXER}/summary`).then(r => r.json()),
          fetch(`${INDEXER}/feed?limit=40`).then(r => r.json()),
          fetch(`${PROVIDER}/prices`).then(r => r.json()).catch(() => ({ prices: {} })),
        ]);
        if (!alive) return;
        setData({ summary: s, feed: f.events ?? [], prices: p.prices ?? {}, live: true });
      } catch {
        if (alive) setData(d => (d.live ? { ...REPLAY, prices: {}, live: false } : d));
      }
    }
    poll();
    const t = setInterval(poll, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return data;
}

export interface QuoteStats {
  purchases: number;
  balks: number;
  confirmed: number;
  revenue: number;
  attestations: number;
  attConfirmed: number;
  conversion: number;
}

export function useQuoteStats(summary: Summary): QuoteStats {
  return useMemo(() => {
    const t = summary.totals.find(x => x.endpoint_id === "quote");
    const b = summary.balks.find(x => x.endpoint_id === "quote");
    const a = summary.attest.find(x => x.endpoint_id === "quote");
    const purchases = t?.purchases ?? 0;
    const balks = b?.balks ?? 0;
    const obs = purchases + balks;
    return {
      purchases,
      balks,
      confirmed: t?.confirmed ?? 0,
      revenue: tokens(t?.revenue ?? 0),
      attestations: a?.attestations ?? 0,
      attConfirmed: a?.confirmed ?? 0,
      conversion: obs ? (100 * purchases) / obs : 0,
    };
  }, [summary]);
}

export async function sendShock(multiplier: number): Promise<void> {
  await fetch(`${INDEXER}/control/shock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ multiplier }),
  }).catch(() => {});
}
