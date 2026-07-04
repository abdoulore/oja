# ỌJÀ

**The pricing layer for the machine economy on Casper.**

Ọjà is the Yoruba word for market. This is a live one: autonomous buyer agents pay for an API over the x402 protocol, settling real CEP-18 transfers on Casper testnet, while an autonomous pricing agent learns the demand curve from settlement data and reprices the API in real time. Every price change is attested on-chain in an Odra contract, so any agent can verify that the price it was quoted is the price the market was told.

Built for the Casper Agentic Buildathon 2026, Agentic AI + DeFi and Payments tracks.

## The problem

x402 turned every HTTP endpoint into a market. Nick Szabo's old argument against micropayments was that the mental cost of deciding "is this worth $0.001?" exceeds the payment itself. Agents dissolve that objection: they have no mental transaction cost. But look at every x402 integration shipping today, including the official examples: the price is a hardcoded string. Machines are finally price-sensitive economic actors, and everyone is selling to them at a price picked once by a human and never revisited.

Ọjà is what the supply side looks like when it is also an agent.

1. **A pricing agent that learns.** A UCB1 bandit over a price ladder, rewarded by revenue per window. It observes only aggregate behavior (purchases, balks, revenue) from the indexer. It never sees buyer valuations. It explores, converges on the revenue-maximizing price, and re-converges when demand shifts. An LLM (any OpenAI-compatible API) narrates each decision for the dashboard.
2. **On-chain price transparency.** Every price move is attested in the `PriceRegistry` Odra contract with a sha256 commitment to the demand statistics that justified it. Quoted price and attested price are independently checkable by any buyer agent before it pays. Pricing for machines becomes auditable by machines.
3. **A market you can watch.** A landing page and terminal-style dashboard with a live settlement tape and the pricing agent's reasoning log. Every row is a real testnet transaction with a cspr.live link. A demand-shock button makes the fleet richer or poorer mid-demo so you can watch the agent re-learn. When the local stack is offline, the frontend replays a recorded real session, every hash still verifiable.

## Live on casper-test

Deployed and verifiable right now:

| Artifact | Address |
| --- | --- |
| `PriceRegistry` (Odra 2.8) | [`hash-3d559a62...da78ec`](https://testnet.cspr.live/contract-package/3d559a62f46f789325df56459e2621ca7ffe9d933087c9140745ce08e7da78ec) |
| OJA token (Cep18X402) | [`hash-b57ab210...639c19`](https://testnet.cspr.live/contract-package/b57ab2106db957d8dab612bb0c82a91f5ad3b31ffddfdbdfeaae6bc233639c19) |

70+ x402 settlements and every price attestation from the development sessions are on chain; the dashboard links to each one.

## What is real (and what is simulated)

Real: every payment is a genuine x402 flow (402 challenge, EIP-712 signature, facilitator verify + settle) producing a `transfer_with_authorization` transaction on casper-test. Every attestation is a genuine `PriceRegistry.attest_price` call. The indexer independently confirms every self-reported transaction hash against the testnet RPC before marking it confirmed; unverified rows say "pending" and stay that way if the chain disagrees.

Simulated: the buyers' *willingness to pay*. Demo buyers draw hidden valuations from a distribution so there is a demand curve to learn on a testnet with no organic traffic. The pricing agent has no access to those valuations; it learns exactly the way it would against strangers. Nothing else is mocked, and there are no fallback fake transactions anywhere in this codebase.

## Architecture

```
 buyer agents (N)                        pricing agent
 hidden valuations                       UCB1 bandit + LLM narration
   |  probe 402 price                       |  read window stats
   |  pay via x402 or balk                  |  set price      attest on-chain
   v                                        v                    v
 provider (Express + @x402/express) --> indexer (SQLite) <-- attest.mjs (casper-js-sdk)
   |  dynamic money parser               |  RPC-confirms          |
   v                                     v   every tx hash        v
 facilitator (verify/settle) ------> casper-test <------- PriceRegistry (Odra)
        settles CEP-18 transfer_with_authorization         PriceAttested events
```

The facilitator is the sponsored CSPR.cloud x402 facilitator by default (it pays settlement gas; the free tier includes 1,000 testnet settlements). A self-hosted facilitator ships in this repo as a one-line `.env` fallback.

Monorepo layout: `contracts/` (Odra 2.8 PriceRegistry + Rust livenet bins for Linux/macOS) · `scripts/livenet/` (cross-platform casper-js-sdk CLI: deploy, register, attest, fund, status) · `packages/provider` · `packages/facilitator` (self-hosted fallback) · `packages/agents` (buyers + pricing agent) · `packages/indexer` · `packages/dashboard` (landing page + market terminal, Vite/React) · `vendor/Cep18X402.wasm` (official x402 CEP-18 from make-software/casper-x402).

A note on the two CLI implementations: the original deployment tooling is Rust (Odra livenet). `casper-types` does not compile on Windows (Unix-only libc calls), so `scripts/livenet/*.mjs` reimplements the same five commands on casper-js-sdk with identical behavior. The Node CLI is the default documented path; the Rust bins remain for Linux/macOS users who prefer them.

## Quickstart

Prereqs: Node 20+. Rust is only needed if you want to rebuild the contract wasm (`contracts/wasm/PriceRegistry.wasm` is committed): rustup with the pinned `nightly-2026-01-01`, `cargo install cargo-odra`, wabt + binaryen on PATH. On Windows, run `cargo odra build` from Git Bash.

```bash
npm install
cp .env.example .env
node scripts/keygen.mjs            # deployer + buyer keys
# fund the deployer: https://testnet.cspr.live/tools/faucet
node scripts/livenet/status.mjs    # check connectivity + balance

# on-chain setup (each step fills .env as it goes)
node scripts/livenet/deploy-registry.mjs
node scripts/livenet/register-endpoint.mjs <REGISTRY_ADDRESS> quote 1000000000
node scripts/livenet/deploy-token.mjs
node scripts/livenet/fund-buyers.mjs

# contract unit tests (optional, needs Rust)
cd contracts && cargo odra test

# run the market
npm run demo                       # indexer + facilitator + provider + buyers + pricing agent
npm run dashboard                  # http://localhost:5173 (landing) and /#/market (terminal)
```

Facilitator options in `.env`:

- **Sponsored (default):** `FACILITATOR_URL=https://x402-facilitator.cspr.cloud` with `FACILITATOR_API_KEY` set to a free CSPR.cloud access token from [console.cspr.build](https://console.cspr.build). CSPR.cloud pays settlement gas.
- **Self-hosted:** `FACILITATOR_URL=http://localhost:4022`, no key. Settlement gas (~2.7 CSPR each) comes from the deployer key.

Optional LLM narration: set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (any OpenAI-compatible API; DeepSeek works) and the pricing agent explains every reprice in plain language on the dashboard.

## The demo, in one arc

Start the market. The tape fills with PAID and BALK rows at the opening price. Watch the agent walk the ladder: it tries a rung per window, revenue per window is its reward, and the amber price line staircases toward the revenue-maximizing rung, each step pinned by a violet on-chain attestation and a one-sentence explanation in the agent log. Hit **bust ×0.6**. Buyers get poorer, conversion collapses, and the agent walks the price back down and settles on a new optimum. Click any row and read the same transaction on cspr.live.

## Buildathon qualification mapping

Builder Merit Path requires a working prototype on Casper Testnet with a transaction-producing on-chain component. Ọjà produces two independent transaction streams: x402 settlements (`transfer_with_authorization` on the CEP-18 token) for every purchase, and `attest_price` calls on the PriceRegistry for every price move. The stack is the buildathon's own: x402 protocol end to end, the sponsored CSPR.cloud facilitator, Odra 2.8 contract with standard events (CSPR.cloud-indexable), official `@make-software/casper-x402` packages, deployed and confirmed on casper-test.

## Roadmap

Where this goes after the buildathon:

1. **Mainnet pilot with one real API provider.** The economics already work: the CSPR.cloud facilitator sponsors settlement gas on mainnet tiers, and a provider needs only the provider middleware, a payee key, and the pricing agent. Target: one data API charging real money within a quarter.
2. **The PriceRegistry as shared infrastructure.** The registry is multi-provider by design; any x402 seller on Casper can register endpoints and attest prices to the same contract. Publish it as a public good with a small SDK (`quote → verify attested price → pay`) so buyer agents get market-wide price auditability for free.
3. **Smarter pricing.** The UCB1 bandit is the honest baseline. Next: contextual pricing (time of day, request type, caller history), continuous price optimization, and multi-endpoint portfolio pricing, all behind the same attestation discipline.
4. **Buyer-side tooling.** A client library that refuses to pay when the quoted price deviates from the attested price, making price manipulation visible and costly by default.

## Honest limitations

The bandit treats windows as i.i.d. and the price ladder is discrete; a production version wants contextual pricing and continuous optimization. Buyer demand is synthetic by necessity on testnet. The attestor submits one transaction per window via casper-js-sdk and waits for execution (a few seconds); fine at window cadence, wrong for per-request pricing. Attestation sequence numbers are read from events off-chain rather than the contract counter, so the dashboard labels them by transaction rather than seq. Single provider, single endpoint learned in the demo; the registry itself is multi-provider by design.

## License

MIT. `vendor/Cep18X402.wasm` and the facilitator port derive from [make-software/casper-x402](https://github.com/make-software/casper-x402) (Apache-2.0).
