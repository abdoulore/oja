//! Registers a paid endpoint in the PriceRegistry.
//! Usage: cargo run --bin register_endpoint --features livenet --release -- <registry_addr> <endpoint_id> <initial_price_motes>
use std::str::FromStr;
use odra::host::HostRefLoader;
use odra::casper_types::U256;
use odra::Address;
use oja_contracts::PriceRegistry;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: register_endpoint <registry_addr> <endpoint_id> <initial_price_motes>");
        std::process::exit(2);
    }
    let env = odra_casper_livenet_env::env();
    let addr = Address::from_str(&args[1]).expect("bad registry address");
    let mut registry = PriceRegistry::load(&env, addr);
    let price = U256::from_dec_str(&args[3]).expect("bad price");
    env.set_gas(5_000_000_000u64);
    registry.register_endpoint(args[2].clone(), price);
    println!("registered endpoint '{}' at {} motes", args[2], args[3]);
}
