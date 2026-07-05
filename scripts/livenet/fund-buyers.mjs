// Transfers OJA to every generated buyer key. Node port of scripts/fund-buyers.sh.
// Buyers need no CSPR at all: the facilitator submits and pays gas.
// Usage: node scripts/livenet/fund-buyers.mjs  (TOKEN_ADDR/AMOUNT env optional)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, CHAIN, sdk, rpcClient, loadDeployer, stripHash, toAccountHashHex, submitAndWait } from "./common.mjs";

const { ContractCallBuilder, Args, CLValue, Key } = sdk;

const TOKEN = process.env.TOKEN_ADDR || process.env.TOKEN_PACKAGE_HASH;
if (!TOKEN) {
  console.error("set TOKEN_ADDR=hash-... (or TOKEN_PACKAGE_HASH in .env)");
  process.exit(2);
}
const AMOUNT = process.env.AMOUNT || "50000000000";
const BUYERS_DIR = resolve(ROOT, "keys/buyers");

const deployer = loadDeployer();
const client = rpcClient();

for (const dir of readdirSync(BUYERS_DIR)) {
  const base = resolve(BUYERS_DIR, dir);
  const hashFile = resolve(base, "account_hash.txt");
  const pubFile = resolve(base, "public_key_hex.txt");
  const raw = readFileSync(existsSync(hashFile) ? hashFile : pubFile, "utf8").trim();
  console.log(`funding ${dir} (${raw.slice(0, 32)}...) with ${AMOUNT} motes OJA...`);
  const tx = new ContractCallBuilder()
    .from(deployer.publicKey)
    .byPackageHash(stripHash(TOKEN))
    .entryPoint("transfer")
    .runtimeArgs(
      Args.fromMap({
        recipient: CLValue.newCLKey(Key.newKey("account-hash-" + toAccountHashHex(raw))),
        amount: CLValue.newCLUInt256(AMOUNT),
      }),
    )
    .chainName(CHAIN)
    .payment(5_000_000_000) // cep18 transfer; casper-test V1 minimum limit needs headroom
    .build();
  tx.sign(deployer);
  await submitAndWait(client, tx, { label: `fund ${dir}` });
}
console.log("fleet funded.");
