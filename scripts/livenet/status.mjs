// Shows chain connectivity and the deployer's CSPR balance — handy while
// waiting for the faucet. Usage: node scripts/livenet/status.mjs
import { CHAIN, RPC_URL, sdk, rpcClient, loadDeployer } from "./common.mjs";

const { PurseIdentifier } = sdk;

const deployer = loadDeployer();
const client = rpcClient();

console.log(`rpc:      ${RPC_URL}`);
console.log(`chain:    ${CHAIN}`);
console.log(`deployer: ${deployer.publicKey.toHex()}`);

const status = await client.getStatus();
console.log(`node:     ${status.buildVersion ?? "?"} (chainspec ${status.chainSpecName ?? "?"})`);

try {
  const balance = await client.queryLatestBalance(PurseIdentifier.fromPublicKey(deployer.publicKey));
  const motes = BigInt(balance.balance?.toString() ?? "0");
  console.log(`balance:  ${motes} motes (${Number(motes) / 1e9} CSPR)`);
} catch (e) {
  console.log(`balance:  account not found on chain yet — fund it at https://testnet.cspr.live/tools/faucet`);
  console.log(`          (${e.message ?? e})`);
}
