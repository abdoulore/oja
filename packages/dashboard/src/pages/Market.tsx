// The ỌJÀ terminal: live chart, stat row, settlement tape, demand-shock controls.
// Same IA as the original dashboard, restyled on the shared token system.
import { useMarketData, useQuoteStats, fmt, tokens, sendShock } from "../lib/market";
import { LiveBadge, Tape } from "../components/Tape";
import { PriceChart } from "../components/PriceChart";
import { AgentLog } from "../components/AgentLog";

export default function Market() {
  const data = useMarketData();
  const q = useQuoteStats(data.summary);
  const livePrice = tokens(data.prices["quote"] ?? "0");
  const shockNow = data.summary.shockMultiplier ?? 1;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1180px] flex-col gap-3.5 px-5 pb-14 pt-5 text-[13px]">
      {/* ---------- header ---------- */}
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-grid pb-3">
        <div className="mr-auto flex items-baseline gap-3">
          <a
            href="#/"
            className="font-display text-[24px] font-bold tracking-[0.14em] text-amber no-underline [text-shadow:0_0_24px_rgba(245,167,66,0.35)]"
          >
            ỌJÀ
          </a>
          <span className="text-[11px] text-dim">the market watches itself</span>
          <LiveBadge live={data.live} />
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.14em] text-dim">quote endpoint</span>
          <span className="text-[20px] font-bold text-amber">
            {data.live ? `${fmt(livePrice, 2)} OJA` : "offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-dim">
            demand {shockNow !== 1 ? `x${shockNow}` : "normal"}
          </span>
          <ShockButton onClick={() => sendShock(1.6)}>boom x1.6</ShockButton>
          <ShockButton onClick={() => sendShock(0.6)}>bust x0.6</ShockButton>
          <ShockButton dim onClick={() => sendShock(1)}>
            reset
          </ShockButton>
        </div>
      </header>

      {!data.live && (
        <div className="border border-alert/35 bg-alert/10 px-3.5 py-2.5 text-[12px] text-alert">
          local stack offline, replaying a recorded casper-test session. Start the market with:
          npm run demo
        </div>
      )}

      {/* ---------- layout ---------- */}
      <main className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px] lg:[grid-template-areas:'chart_tape'_'stats_tape'_'agent_tape']">
        <section className="border border-grid bg-gradient-to-b from-panel to-panel-2 px-4 pb-2.5 pt-3.5 lg:[grid-area:chart]">
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.16em] text-dim">
            attested price. every point is an on-chain attestation
          </div>
          <PriceChart summary={data.summary} height={260} />
        </section>

        <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:[grid-area:stats]">
          <Stat label="revenue" value={`${fmt(q.revenue)} OJA`} tone="money" />
          <Stat label="purchases" value={String(q.purchases)} tone="money" />
          <Stat label="balks" value={String(q.balks)} tone="dim" />
          <Stat label="conversion" value={`${fmt(q.conversion, 0)}%`} />
          <Stat label="tx confirmed" value={`${q.confirmed}/${q.purchases}`} tone="money" />
          <Stat label="attested" value={`${q.attConfirmed}/${q.attestations}`} tone="violet" />
        </section>

        <section className="border border-grid bg-gradient-to-b from-panel to-panel-2 px-4 pb-3 pt-3.5 lg:[grid-area:agent]">
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.16em] text-dim">
            pricing agent log. the reasoning behind each attested window
          </div>
          <AgentLog feed={data.feed} />
        </section>

        <section className="flex min-h-[420px] flex-col border border-grid bg-gradient-to-b from-panel to-panel-2 px-4 pb-2.5 pt-3.5 lg:[grid-area:tape]">
          <div className="mb-2.5 text-[10px] uppercase tracking-[0.16em] text-dim">
            settlement tape. click a row to verify on cspr.live
          </div>
          <Tape feed={data.feed} className="max-h-[560px]" />
        </section>
      </main>

      <footer className="mt-auto border-t border-grid pt-3 text-[10px] tracking-[0.08em] text-dim">
        every purchase is a real x402 settlement on casper-test. every price move is attested in
        the PriceRegistry. nothing here is mocked.
      </footer>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const valueColor =
    tone === "money"
      ? "text-money"
      : tone === "violet"
        ? "text-violet"
        : tone === "dim"
          ? "text-dim"
          : "text-body";
  const borderColor =
    tone === "money" ? "border-l-money" : tone === "violet" ? "border-l-violet" : "border-l-grid";
  return (
    <div className={`border border-grid border-l-2 bg-panel px-3.5 py-3 ${borderColor}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-dim">{label}</div>
      <div className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

function ShockButton({
  children,
  onClick,
  dim,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`border border-grid bg-panel px-3 py-1.5 font-mono text-[11px] tracking-[0.04em] transition-colors duration-150 hover:border-amber hover:text-amber active:translate-y-px ${
        dim ? "text-dim" : "text-body"
      }`}
    >
      {children}
    </button>
  );
}
