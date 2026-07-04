// The settlement tape: every row is a real event, purchase rows link to cspr.live.
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle, Clock } from "@phosphor-icons/react";
import { clock, fmt, tokens, EXPLORER_TX, type FeedEvent } from "../lib/market";

function ChainMark({ e }: { e: FeedEvent }) {
  if (!e.tx_hash) return <span className="text-dim">no-hash</span>;
  if (e.confirmed)
    return (
      <span className={`inline-flex items-center gap-1 ${e.kind === "attestation" ? "text-violet" : "text-money"}`}>
        <CheckCircle size={13} weight="bold" aria-hidden />
        chain
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-dim">
      <Clock size={13} aria-hidden />
      pending
    </span>
  );
}

export function TapeRow({ e }: { e: FeedEvent }) {
  const reduce = useReducedMotion();
  const link = e.tx_hash ? `${EXPLORER_TX}${e.tx_hash}` : undefined;

  const body =
    e.kind === "purchase" ? (
      <>
        <span className="font-bold text-[10px] tracking-[0.08em] text-money">PAID</span>
        <span className="truncate">{e.buyer_id ?? "provider"}</span>
        <span className="text-money">{fmt(tokens(e.price_motes))} OJA</span>
        <ChainMark e={e} />
      </>
    ) : e.kind === "balk" ? (
      <>
        <span className="font-bold text-[10px] tracking-[0.08em] text-dim">BALK</span>
        <span className="truncate text-dim">{e.buyer_id}</span>
        <span className="text-dim">at {fmt(tokens(e.price_motes))} OJA</span>
        <span className="text-dim">too pricey</span>
      </>
    ) : (
      <>
        <span className="font-bold text-[10px] tracking-[0.08em] text-violet">ATTEST</span>
        <span className="text-violet truncate">
          {fmt(tokens(e.old_price_motes))} to {fmt(tokens(e.new_price_motes))} OJA
        </span>
        <span className="text-dim">reprice</span>
        <ChainMark e={e} />
      </>
    );

  const row = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={`grid grid-cols-[52px_46px_minmax(0,1fr)_auto_auto] items-baseline gap-x-2.5 border-l-2 px-2 py-1.5 text-[12px] border-b border-b-grid/60 border-dashed ${
        e.kind === "purchase"
          ? "border-l-money/50"
          : e.kind === "attestation"
            ? "border-l-violet/60 bg-violet/5"
            : "border-l-transparent"
      }`}
    >
      <span className="text-[10px] text-dim">{clock(e.at)}</span>
      {body}
    </motion.div>
  );

  return link ? (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      title={e.tx_hash}
      className="group block no-underline text-inherit hover:bg-amber/5"
    >
      {row}
    </a>
  ) : (
    row
  );
}

export function Tape({
  feed,
  limit,
  className,
}: {
  feed: FeedEvent[];
  limit?: number;
  className?: string;
}) {
  const rows = limit ? feed.slice(0, limit) : feed;
  return (
    <div className={`flex flex-col overflow-y-auto ${className ?? ""}`}>
      {rows.length === 0 && (
        <div className="px-2 py-6 text-dim">
          waiting for the market. start it with:{" "}
          <span className="text-body">npm run demo</span>
        </div>
      )}
      {rows.map((e, i) => (
        <TapeRow key={`${e.kind}-${e.at}-${i}`} e={e} />
      ))}
    </div>
  );
}

export function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
        live ? "border-money/40 text-money" : "border-grid text-dim"
      }`}
      title={live ? "streaming from your local indexer" : "replaying a recorded casper-test session"}
    >
      {live ? "live" : "replay"}
    </span>
  );
}
