// Deploys PriceRegistry to casper-test. Node port of contracts/bin/deploy_registry.rs.
// Usage: node scripts/livenet/deploy-registry.mjs
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

const WASM_PATH = resolve(ROOT, "contracts/wasm/PriceRegistry.wasm");
const PACKAGE_KEY = "price_registry";
const PAYMENT_MOTES = 300_000_000_000; // matches deploy_registry.rs set_gas

const deployer = loadDeployer();
const client = rpcClient();
const wasm = new Uint8Array(readFileSync(WASM_PATH));
console.log(`Deploying PriceRegistry (${wasm.length} bytes) to ${CHAIN} as ${deployer.publicKey.toHex()}`);

// Standard Odra installer args; PriceRegistry::init takes no arguments.
const args = Args.fromMap({
  odra_cfg_package_hash_key_name: CLValue.newCLString(PACKAGE_KEY),
  odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
  odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
  odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
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

await submitAndWait(client, tx, { label: "deploy PriceRegistry", timeoutMs: 300_000 });

const packageHash = await readNamedKeyHash(client, deployer.publicKey, PACKAGE_KEY);
const address = `hash-${packageHash}`;
console.log(`REGISTRY_ADDRESS=${address}`);
console.log(`  https://testnet.cspr.live/contract-package/${packageHash}`);
updateEnv("REGISTRY_ADDRESS", address);
