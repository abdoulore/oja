// Transfers OJA tokens from the deployer to one recipient. Node port of fund.rs.
// Usage: node scripts/livenet/fund.mjs <token_addr> <recipient> <amount_motes>
import { CHAIN, sdk, rpcClient, loadDeployer, stripHash, toAccountHashHex, submitAndWait } from "./common.mjs";

const { ContractCallBuilder, Args, CLValue, Key } = sdk;

const [, , tokenArg, recipientArg, amount] = process.argv;
if (!tokenArg || !recipientArg || !amount) {
  console.error("usage: fund.mjs <token_addr> <recipient> <amount_motes>");
  process.exit(2);
}

const deployer = loadDeployer();
const client = rpcClient();

const recipientKey = Key.newKey("account-hash-" + toAccountHashHex(recipientArg));
const tx = new ContractCallBuilder()
  .from(deployer.publicKey)
  .byPackageHash(stripHash(tokenArg))
  .entryPoint("transfer")
  .runtimeArgs(
    Args.fromMap({
      recipient: CLValue.newCLKey(recipientKey),
      amount: CLValue.newCLUInt256(amount),
    }),
  )
  .chainName(CHAIN)
  .payment(5_000_000_000) // plain cep18 transfer; casper-test V1 minimum limit needs headroom
  .build();
tx.sign(deployer);

await submitAndWait(client, tx, { label: "cep18 transfer" });
console.log(`funded ${recipientArg} with ${amount} motes`);
