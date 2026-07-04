// Attests a price change on-chain. Node port of contracts/bin/attest.rs; the
// pricing agent spawns this per window. Output contract (parsed by
// pricing-agent.ts): a "TransactionV1Hash(<64hex>)" line for the tx hash and
// exit code 0 on success.
// Usage: node scripts/livenet/attest.mjs <registry_addr> <endpoint_id> <new_price_motes> <stats_hash_hex>
import { CHAIN, sdk, rpcClient, loadDeployer, stripHash, submitAndWait } from "./common.mjs";

const { ContractCallBuilder, Args, CLValue } = sdk;

const [, , registryArg, endpointId, newPrice, statsHash] = process.argv;
if (!registryArg || !endpointId || !newPrice || !statsHash) {
  console.error("usage: attest.mjs <registry_addr> <endpoint_id> <new_price_motes> <stats_hash_hex>");
  process.exit(2);
}

const deployer = loadDeployer();
const client = rpcClient();

const tx = new ContractCallBuilder()
  .from(deployer.publicKey)
  .byPackageHash(stripHash(registryArg))
  .entryPoint("attest_price")
  .runtimeArgs(
    Args.fromMap({
      endpoint_id: CLValue.newCLString(endpointId),
      new_price: CLValue.newCLUInt256(newPrice),
      stats_hash: CLValue.newCLString(statsHash),
    }),
  )
  .chainName(CHAIN)
  .payment(1_000_000_000) // measured consumption ~0.57 CSPR; 75%-refund chain penalizes headroom
  .build();
tx.sign(deployer);

await submitAndWait(client, tx, { label: `attest_price '${endpointId}'` });
console.log(`ATTESTED endpoint=${endpointId} price=${newPrice}`);
