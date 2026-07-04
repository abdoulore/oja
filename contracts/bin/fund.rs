//! Transfers Ọjà CEP-18 tokens from the deployer to a buyer agent account.
//! Usage: cargo run --bin fund --features livenet --release -- <token_addr> <recipient> <amount_motes>
//! <recipient> may be an odra Address string or an "account-hash-..." string.
//! Loads the token through the standard odra-modules Cep18 interface (the
//! x402 token is a CEP-18 superset, so `transfer` is compatible).
use std::str::FromStr;
use odra::casper_types::account::AccountHash;
use odra::casper_types::U256;
use odra::host::HostRefLoader;
use odra::Address;
use odra_modules::cep18_token::Cep18;

fn parse_address(s: &str) -> Address {
    if let Ok(a) = Address::from_str(s) {
        return a;
    }
    if let Ok(h) = AccountHash::from_formatted_str(s) {
        return Address::from(h);
    }
    panic!("could not parse recipient '{s}': pass an odra Address or account-hash-... string");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: fund <token_addr> <recipient_addr> <amount_motes>");
        std::process::exit(2);
    }
    let env = odra_casper_livenet_env::env();
    let token_addr = parse_address(&args[1]);
    let recipient = parse_address(&args[2]);
    let amount = U256::from_dec_str(&args[3]).expect("bad amount");
    let mut token = Cep18::load(&env, token_addr);
    env.set_gas(4_000_000_000u64);
    token.transfer(&recipient, &amount);
    println!("funded {} with {} motes", args[2], args[3]);
}
