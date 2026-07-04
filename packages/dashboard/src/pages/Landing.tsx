// ỌJÀ landing. Dark terminal market, amber accent, real data everywhere:
// the hero tape and proof strip stream from the indexer, or replay a real
// recorded casper-test session when the local stack is down.
import {
  CheckCircle,
  Flask,
  Plugs,
  SealCheck,
  Signature,
  TrendUp,
} from "@phosphor-icons/react";
import {
  EXPLORER_PKG,
  EXPLORER_TX,
  REGISTRY_PACKAGE,
  TOKEN_PACKAGE,
  useMarketData,
  useQuoteStats,
} from "../lib/market";
import { GhostCta, NumberTicker, PrimaryCta, Reveal } from "../components/ui";
import { LiveBadge, Tape } from "../components/Tape";
import { PriceChart } from "../components/PriceChart";

const OPEN_MARKET = "Open the live market";

export default function Landing() {
  const data = useMarketData();
  const q = useQuoteStats(data.summary);
  const sampleTx = data.feed.find(e => e.kind === "purchase" && e.tx_hash)?.tx_hash;

  return (
    <div className="min-h-[100dvh]">
      {/* ---------- nav ---------- */}
      <nav className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
        <a href="#/" className="flex items-baseline gap-3 no-underline">
          <span className="font-display text-[22px] font-bold tracking-[0.14em] text-amber [text-shadow:0_0_24px_rgba(245,167,66,0.35)]">
            ỌJÀ
          </span>
          <span className="hidden text-[11px] text-dim sm:inline">the market watches itself</span>
        </a>
        <div className="flex items-center gap-4">
          <LiveBadge live={data.live} />
          <a
            href="#/market"
            className="font-mono text-[13px] text-body no-underline hover:text-amber"
          >
            market
          </a>
        </div>
      </nav>

      {/* ---------- hero: asymmetric split ---------- */}
      <header className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 pt-14 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="mb-4 text-[11px] uppercase tracking-[0.18em] text-dim">
            x402 on Casper testnet
          </p>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tighter text-white md:text-5xl lg:text-6xl">
            The pricing layer for the <span className="text-amber">machine economy</span>.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-body">
            Agents pay per request over x402 on Casper. A pricing agent learns demand and
            attests every move on-chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryCta href="#/market">{OPEN_MARKET}</PrimaryCta>
            <GhostCta href={`${EXPLORER_PKG}${REGISTRY_PACKAGE}`} external>
              Verify on-chain
            </GhostCta>
          </div>
        </div>

        <Reveal>
          <div className="border border-grid bg-gradient-to-b from-panel to-panel-2">
            <div className="flex items-center justify-between border-b border-grid px-4 py-2.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-dim">
                settlement tape
              </span>
              <LiveBadge live={data.live} />
            </div>
            <div className="px-2 pt-2">
              <PriceChart summary={data.summary} height={110} />
            </div>
            <Tape feed={data.feed} limit={8} className="max-h-[290px] px-2 pb-2" />
          </div>
        </Reveal>
      </header>

      {/* ---------- proof strip ---------- */}
      <section className="border-y border-grid bg-panel-2/60">
        <div className="mx-auto max-w-[1180px] px-5 py-12">
          <Reveal>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              <Proof label="settlements" tone="text-money">
                <NumberTicker value={q.purchases} />
              </Proof>
              <Proof label="confirmed on-chain" tone="text-money">
                <NumberTicker value={q.confirmed} />
              </Proof>
              <Proof label="price attestations" tone="text-violet">
                <NumberTicker value={q.attestations} />
              </Proof>
              <Proof label="OJA revenue" tone="text-amber">
                <NumberTicker value={q.revenue} dp={1} />
              </Proof>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 border-t border-grid pt-5 text-[12px]">
              <span className="text-dim">verify it yourself:</span>
              <ProofLink href={`${EXPLORER_PKG}${REGISTRY_PACKAGE}`}>
                PriceRegistry contract
              </ProofLink>
              <ProofLink href={`${EXPLORER_PKG}${TOKEN_PACKAGE}`}>OJA token contract</ProofLink>
              {sampleTx && (
                <ProofLink href={`${EXPLORER_TX}${sampleTx}`}>a real settlement tx</ProofLink>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- the loop ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-24">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            One loop, twice autonomous.
          </h2>
          <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-body">
            The demand side and the supply side are both agents. No human touches a price.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-px border border-grid bg-grid md:grid-cols-4">
          <LoopNode
            icon={<Plugs size={22} aria-hidden />}
            title="Probe"
            body="A buyer calls the paid endpoint and gets a 402 with the current price."
            delay={0}
          />
          <LoopNode
            icon={<Signature size={22} aria-hidden />}
            title="Pay or balk"
            body="Worth it? The buyer signs an EIP-712 transfer authorization. Too pricey? It walks."
            delay={0.06}
          />
          <LoopNode
            icon={<TrendUp size={22} aria-hidden />}
            title="Learn"
            body="A UCB1 bandit treats each price as an arm. Revenue per window is the reward."
            delay={0.12}
          />
          <LoopNode
            icon={<SealCheck size={22} aria-hidden />}
            title="Attest"
            body="Every reprice lands in the PriceRegistry with a hash of the stats that justified it."
            delay={0.18}
            tone="violet"
          />
        </div>
      </section>

      {/* ---------- real vs simulated ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 pb-24">
        <Reveal>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            What is real, what is simulated.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="h-full border border-money/25 bg-panel p-7">
              <h3 className="font-display text-lg font-bold text-money">Real</h3>
              <ul className="mt-5 space-y-4 text-[13px] leading-relaxed">
                <HonestRow icon={<CheckCircle size={16} weight="bold" className="text-money" aria-hidden />}>
                  Every purchase is a full x402 flow: 402 challenge, EIP-712 signature,
                  facilitator verify and settle.
                </HonestRow>
                <HonestRow icon={<CheckCircle size={16} weight="bold" className="text-money" aria-hidden />}>
                  Settlement is a transfer_with_authorization transaction on the CEP-18 token,
                  on casper-test.
                </HonestRow>
                <HonestRow icon={<CheckCircle size={16} weight="bold" className="text-money" aria-hidden />}>
                  The indexer re-verifies every self-reported tx hash against the chain RPC.
                  Unverified rows stay marked pending.
                </HonestRow>
                <HonestRow icon={<CheckCircle size={16} weight="bold" className="text-money" aria-hidden />}>
                  Every price move is an attest_price call on the PriceRegistry, an Odra
                  contract with standard events.
                </HonestRow>
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="h-full border border-grid bg-panel p-7">
              <h3 className="font-display text-lg font-bold text-body">Simulated</h3>
              <ul className="mt-5 space-y-4 text-[13px] leading-relaxed">
                <HonestRow icon={<Flask size={16} className="text-dim" aria-hidden />}>
                  Buyer willingness to pay. Demo buyers draw hidden valuations from a
                  distribution, because a testnet has no organic traffic.
                </HonestRow>
                <HonestRow icon={<Flask size={16} className="text-dim" aria-hidden />}>
                  The pricing agent never sees those valuations. It learns from observed
                  behavior alone, exactly as it would against strangers.
                </HonestRow>
                <HonestRow icon={<Flask size={16} className="text-dim" aria-hidden />}>
                  Nothing else. There are no fallback fake transactions anywhere in the
                  codebase.
                </HonestRow>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- shock band ---------- */}
      <section className="border-y border-grid bg-panel-2/60">
        <div className="mx-auto max-w-[1180px] px-5 py-20 text-center">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              Break the market on purpose.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[14px] leading-relaxed text-body">
              The bust button makes every buyer poorer mid-run. Watch conversion collapse,
              then watch the agent walk the price back down and re-converge.
            </p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta href="#/market">{OPEN_MARKET}</PrimaryCta>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="mx-auto max-w-[1180px] px-5 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-6">
          <div>
            <span className="font-display text-lg font-bold tracking-[0.14em] text-amber">ỌJÀ</span>
            <p className="mt-2 max-w-[44ch] text-[12px] leading-relaxed text-dim">
              Ọjà is the Yoruba word for market. Built for the Casper Agentic Buildathon 2026.
              MIT licensed.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-[12px]">
            <ProofLink href={`${EXPLORER_PKG}${REGISTRY_PACKAGE}`}>PriceRegistry</ProofLink>
            <ProofLink href={`${EXPLORER_PKG}${TOKEN_PACKAGE}`}>OJA token</ProofLink>
            <ProofLink href="https://github.com/make-software/casper-x402">
              casper-x402 protocol
            </ProofLink>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Proof({
  label,
  tone,
  children,
}: {
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`font-mono text-3xl font-bold md:text-4xl ${tone}`}>{children}</div>
      <div className="mt-1.5 text-[11px] text-dim">{label}</div>
    </div>
  );
}

function ProofLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-body underline decoration-grid underline-offset-4 hover:text-amber hover:decoration-amber"
    >
      {children}
    </a>
  );
}

function LoopNode({
  icon,
  title,
  body,
  delay,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  delay: number;
  tone?: "violet";
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="h-full bg-panel p-6">
        <div className={tone === "violet" ? "text-violet" : "text-amber"}>{icon}</div>
        <h3 className="mt-4 font-display text-base font-bold text-white">{title}</h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body">{body}</p>
      </div>
    </Reveal>
  );
}

function HonestRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-body">{children}</span>
    </li>
  );
}
