#!/usr/bin/env bash
# Deploys the official Cep18X402 token (CEP-18 + transfer_with_authorization,
# vendored from make-software/casper-x402) to Casper testnet. Requires
# casper-client:  cargo install casper-client
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_ADDRESS="${NODE_ADDRESS:-https://node.testnet.casper.network}"
CHAIN="${ODRA_CASPER_LIVENET_CHAIN_NAME:-casper-test}"
KEY="${ODRA_CASPER_LIVENET_SECRET_KEY_PATH:-./keys/deployer/secret_key.pem}"
NAME="${TOKEN_NAME:-OjaToken}"
SYMBOL="${TOKEN_SYMBOL:-OJA}"
DECIMALS="${TOKEN_DECIMALS:-9}"
# 1,000,000 tokens at 9 decimals:
SUPPLY="${TOKEN_SUPPLY:-1000000000000000}"

echo "Deploying Cep18X402 '$NAME' ($SYMBOL, $DECIMALS dp, supply $SUPPLY motes) to $CHAIN"
echo "Payer key: $KEY   Node: $NODE_ADDRESS"

# odra_cfg_* flags are the standard Odra installer args (same set the official
# deployer uses). SPIKE NOTE: if the node rejects the deploy over an arg
# type/name, run `casper-client get-deploy <hash>` for the error and compare
# against make-software/casper-x402 infra/local/deployer/deployer.cs.
casper-client put-deploy \
  --node-address "$NODE_ADDRESS" \
  --chain-name "$CHAIN" \
  --secret-key "$KEY" \
  --payment-amount 800000000000 \
  --session-path ./vendor/Cep18X402.wasm \
  --session-arg "odra_cfg_package_hash_key_name:string='oja_token'" \
  --session-arg "odra_cfg_allow_key_override:bool='true'" \
  --session-arg "odra_cfg_is_upgradable:bool='false'" \
  --session-arg "odra_cfg_is_upgrade:bool='false'" \
  --session-arg "name:string='$NAME'" \
  --session-arg "symbol:string='$SYMBOL'" \
  --session-arg "decimals:u8='$DECIMALS'" \
  --session-arg "initial_supply:u256='$SUPPLY'"

cat <<'EOT'

Deploy submitted. Next:
  1. Wait for execution, then open your deployer account on
     https://testnet.cspr.live -> Named Keys -> 'oja_token'
     That value is the CONTRACT PACKAGE HASH.
  2. Put it in .env as TOKEN_PACKAGE_HASH=hash-....
  3. Fund each buyer with tokens (gasless for buyers; deployer pays):
       cd contracts
       cargo run --bin fund --features livenet --release -- \
         <token_contract_addr> <buyer_public_key_hex_or_account> 50000000000
EOT
