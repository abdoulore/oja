// The pricing agent's reasoning, one entry per attested window: what it saw
// (the demand stats it committed on-chain) and why it moved the price.
import { ArrowSquareOut } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import {
  clock,
  fmt,
  parseWindowStats,
  tokens,
  EXPLORER_TX,
  type FeedEvent,
} from "../lib/market";

export function AgentLog({ feed, limit = 4 }: { feed: FeedEvent[]; limit?: number }) {
  const reduce = useReducedMotion();
  const entries = feed.filter(e => e.kind === "attestation").slice(0, limit);

  if (entries.length === 0) {
    return (
      <div className="px-2 py-6 text-[12px] text-dim">
        no attested windows yet. The agent reprices every window and lands here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px bg-grid">
      {entries.map((e, i) => {
        const w = parseWindowStats(e);
        return (
          <motion.article
            key={`${e.at}-${i}`}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="bg-panel px-3.5 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-bold text-violet">
                {fmt(tokens(e.old_price_motes))} to {fmt(tokens(e.new_price_motes))} OJA
              </span>
              <span className="text-[10px] text-dim">{clock(e.at)}</span>
            </div>
            {e.narration && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-body">{e.narration}</p>
            )}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-dim">
              {w && (
                <>
                  <span>
                    {w.purchases}/{w.observations} bought
                  </span>
                  <span>{fmt(tokens(w.revenueMotes))} OJA revenue</span>
                  <span>{w.balks} balked</span>
                </>
              )}
              {e.tx_hash && (
                <a
                  href={`${EXPLORER_TX}${e.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-violet no-underline hover:text-amber"
                >
                  attested
                  <ArrowSquareOut size={11} aria-hidden />
                </a>
              )}
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
