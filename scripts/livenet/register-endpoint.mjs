// Registers a paid endpoint in the PriceRegistry. Node port of register_endpoint.rs.
// Usage: node scripts/livenet/register-endpoint.mjs <registry_addr> <endpoint_id> <initial_price_motes>
import { CHAIN, sdk, rpcClient, loadDeployer, stripHash, submitAndWait } from "./common.mjs";

const { ContractCallBuilder, Args, CLValue } = sdk;

const [, , registryArg, endpointId, initialPrice] = process.argv;
if (!registryArg || !endpointId || !initialPrice) {
  console.error("usage: register-endpoint.mjs <registry_addr> <endpoint_id> <initial_price_motes>");
  process.exit(2);
}

const deployer = loadDeployer();
const client = rpcClient();

const tx = new ContractCallBuilder()
  .from(deployer.publicKey)
  .byPackageHash(stripHash(registryArg))
  .entryPoint("register_endpoint")
  .runtimeArgs(
    Args.fromMap({
      endpoint_id: CLValue.newCLString(endpointId),
      initial_price: CLValue.newCLUInt256(initialPrice),
    }),
  )
  .chainName(CHAIN)
  .payment(2_000_000_000) // one-time call; attest-shaped writes measured well under 1 CSPR
  .build();
tx.sign(deployer);

await submitAndWait(client, tx, { label: `register_endpoint '${endpointId}'` });
console.log(`registered endpoint '${endpointId}' at ${initialPrice} motes`);
