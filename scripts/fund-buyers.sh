#!/usr/bin/env bash
# Transfers OJA to every generated buyer key. Buyers need no CSPR at all:
# the facilitator submits and pays gas for settlement transactions.
# Usage: TOKEN_ADDR=hash-... AMOUNT=50000000000 ./scripts/fund-buyers.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${TOKEN_ADDR:?set TOKEN_ADDR=hash-... (token CONTRACT address)}"
AMOUNT="${AMOUNT:-50000000000}"

cd contracts
for d in ../keys/buyers/*/; do
  f="$d/account_hash.txt"; [ -f "$f" ] || f="$d/public_key_hex.txt"
  REC=$(cat "$f" | tr -d '[:space:]')
  echo "funding $REC with $AMOUNT motes OJA..."
  cargo run --release --features livenet --bin fund -- "$TOKEN_ADDR" "$REC" "$AMOUNT"
done
echo "fleet funded."
