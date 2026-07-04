//! Attests a price change on-chain. Called by the pricing agent.
//! Usage: cargo run --bin attest --features livenet --release -- <registry_addr> <endpoint_id> <new_price_motes> <stats_hash_hex>
//! Prints ATTESTED seq=<n> on success. The Odra livenet host prints the
//! transaction hash to stdout as part of its call logging.
use std::str::FromStr;
use odra::host::HostRefLoader;
use odra::casper_types::U256;
use odra::Address;
use oja_contracts::PriceRegistry;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: attest <registry_addr> <endpoint_id> <new_price_motes> <stats_hash_hex>");
        std::process::exit(2);
    }
    let env = odra_casper_livenet_env::env();
    let addr = Address::from_str(&args[1]).expect("bad registry address");
    let mut registry = PriceRegistry::load(&env, addr);
    let price = U256::from_dec_str(&args[3]).expect("bad price");
    env.set_gas(5_000_000_000u64);
    registry.attest_price(args[2].clone(), price, args[4].clone());
    let seq = registry.attestation_count(args[2].clone());
    println!("ATTESTED seq={}", seq);
}
