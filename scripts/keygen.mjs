// Generates ed25519 PEM keypairs for: deployer (also the provider payee and
// facilitator signer by default) and N buyer agents. Prints public keys so
// you can fund them (deployer: faucet CSPR; buyers: OJA tokens + a little
// CSPR is NOT needed since buyers never pay gas — the facilitator does).
import casperSdk from "casper-js-sdk";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { PrivateKey, KeyAlgorithm } = casperSdk;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUYERS = parseInt(process.env.BUYER_COUNT || "6", 10);

function makeKey(dir, label) {
  mkdirSync(dir, { recursive: true });
  const pemPath = resolve(dir, "secret_key.pem");
  if (existsSync(pemPath)) {
    console.log(`${label}: exists, skipping (${pemPath})`);
    return null;
  }
  const priv = PrivateKey.generate(KeyAlgorithm.ED25519);
  writeFileSync(pemPath, priv.toPem(), { mode: 0o600 });
  const pub = priv.publicKey.toHex();
  writeFileSync(resolve(dir, "public_key_hex.txt"), pub + "\n");
  let acct = "";
  try {
    acct = priv.publicKey.accountHash().toPrefixedString();
    writeFileSync(resolve(dir, "account_hash.txt"), acct + "\n");
  } catch {
    console.warn(`${label}: could not derive account hash locally; grab it from cspr.live after funding`);
  }
  console.log(`${label}: ${pub}${acct ? "  (" + acct + ")" : ""}`);
  return pub;
}

console.log("== Ọjà keygen ==");
makeKey(resolve(ROOT, "keys/deployer"), "deployer  ");
for (let i = 1; i <= BUYERS; i++) {
  makeKey(resolve(ROOT, `keys/buyers/buyer-${i}`), `buyer-${i}  `);
}
console.log(`
Next:
  1. Fund the deployer with testnet CSPR: https://testnet.cspr.live/tools/faucet
  2. Set PAYEE_ADDRESS in .env to the deployer public key hex (or another wallet).
  3. Paste the deployer PEM into SECRET_KEY_PEM_CASPER_CASPER_TEST in .env
     (single line, newlines as \\n) so the self-hosted facilitator can sign.
`);
