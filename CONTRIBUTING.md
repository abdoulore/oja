# Contributing to Ọjà

Thanks for your interest. Ọjà was built for the Casper Agentic Buildathon 2026 and is evolving toward the roadmap in the README (mainnet pilot, multi-provider PriceRegistry, buyer-side verification tooling).

## Getting started

Follow the Quickstart in [README.md](README.md). The short version:

```bash
npm install
cp .env.example .env
node scripts/keygen.mjs
# fund the deployer at https://testnet.cspr.live/tools/faucet, then:
node scripts/livenet/status.mjs
```

Rust is only needed to rebuild the contract wasm; the built `PriceRegistry.wasm` is committed.

## Development notes

- TypeScript everywhere on the service side. Run `npm run typecheck` before pushing.
- The dashboard builds with `npm run build -w packages/dashboard`.
- Contract changes: `cd contracts && cargo odra test` (pinned nightly toolchain, see `contracts/rust-toolchain.toml`). On Windows, run `cargo odra build` from Git Bash.
- Everything on the dashboard must be real: no mocked transactions, no fake data. The indexer independently confirms every transaction hash against the chain RPC. Keep it that way.

## Pull requests

- Keep PRs focused on one change.
- CI must pass (typecheck, dashboard build, audit).
- Describe what you tested against casper-test, with transaction links where relevant.
