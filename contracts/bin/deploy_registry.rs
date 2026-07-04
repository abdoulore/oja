//! Deploys PriceRegistry to the network configured in .env (livenet).
//! Usage: cargo run --bin deploy_registry --features livenet --release
use odra::host::{Deployer, NoArgs};
use oja_contracts::PriceRegistry;

fn main() {
    let env = odra_casper_livenet_env::env();
    env.set_gas(300_000_000_000u64);
    let contract = PriceRegistry::deploy(&env, NoArgs);
    println!("REGISTRY_ADDRESS={}", contract.address().to_string());
}
