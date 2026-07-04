// Deploys the official Cep18X402 token (vendored from make-software/casper-x402)
// to casper-test. Node port of scripts/deploy-token.sh (casper-client cannot be
// built on Windows). Waits for execution and fills TOKEN_PACKAGE_HASH in .env.
// Usage: node scripts/livenet/deploy-token.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROOT,
  CHAIN,
  sdk,
  rpcClient,
  loadDeployer,
  submitAndWait,
  readNamedKeyHash,
  updateEnv,
} from "./common.mjs";

const { SessionBuilder, Args, CLValue } = sdk;

const WASM_PATH = resolve(ROOT, "vendor/Cep18X402.wasm");
const PACKAGE_KEY = "oja_token";
const PAYMENT_MOTES = 800_000_000_000; // matches deploy-token.sh --payment-amount

const NAME = process.env.TOKEN_NAME || "OjaToken";
const SYMBOL = process.env.TOKEN_SYMBOL || "OJA";
const DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "9", 10);
// 1,000,000 tokens at 9 decimals:
const SUPPLY = process.env.TOKEN_SUPPLY || "1000000000000000";

const deployer = loadDeployer();
const client = rpcClient();
const wasm = new Uint8Array(readFileSync(WASM_PATH));
console.log(
  `Deploying Cep18X402 '${NAME}' (${SYMBOL}, ${DECIMALS} dp, supply ${SUPPLY} motes, ` +
    `${wasm.length} bytes) to ${CHAIN} as ${deployer.publicKey.toHex()}`,
);

const args = Args.fromMap({
  odra_cfg_package_hash_key_name: CLValue.newCLString(PACKAGE_KEY),
  odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
  odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
  odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
  name: CLValue.newCLString(NAME),
  symbol: CLValue.newCLString(SYMBOL),
  decimals: CLValue.newCLUint8(DECIMALS),
  initial_supply: CLValue.newCLUInt256(SUPPLY),
  // CAIP-2 id baked into the token's EIP-712 domain; the official deployer
  // (infra/local/deployer/deployer.cs) passes this and init reverts
  // MissingArg without it.
  chain_id: CLValue.newCLString(process.env.CAIP2_CHAIN_ID || "casper:casper-test"),
});

const tx = new SessionBuilder()
  .from(deployer.publicKey)
  .wasm(wasm)
  .installOrUpgrade()
  .runtimeArgs(args)
  .chainName(CHAIN)
  .payment(PAYMENT_MOTES)
  .build();
tx.sign(deployer);

await submitAndWait(client, tx, { label: "deploy Cep18X402", timeoutMs: 300_000 });

const packageHash = await readNamedKeyHash(client, deployer.publicKey, PACKAGE_KEY);
console.log(`TOKEN_PACKAGE_HASH=hash-${packageHash}`);
console.log(`  https://testnet.cspr.live/contract-package/${packageHash}`);
updateEnv("TOKEN_PACKAGE_HASH", `hash-${packageHash}`);
console.log(`\nNext: fund the buyer fleet:\n  node scripts/livenet/fund-buyers.mjs`);
