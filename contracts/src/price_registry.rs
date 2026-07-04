//! Ọjà PriceRegistry
//!
//! On-chain price transparency for x402 providers. Every price change made by
//! the autonomous pricing agent is attested here, so any buyer agent can verify
//! that the price it was quoted over HTTP matches the publicly attested price,
//! and can read the full pricing history of an endpoint before trusting it.
//!
//! Design notes:
//! - Events follow the Odra event standard, so CSPR.cloud / cspr.live index
//!   them out of the box.
//! - `attest_price` is provider-gated: only the address that registered an
//!   endpoint can attest new prices for it.
//! - `stats_hash` is a hex sha256 of the demand-window statistics that
//!   justified the price move (observations, purchases, revenue). The raw
//!   stats are served off-chain by the indexer; the hash makes them
//!   tamper-evident.

use odra::casper_types::U256;
use odra::prelude::*;

/// Errors the registry can revert with.
#[odra::odra_error]
pub enum Error {
    /// Endpoint id is already registered.
    AlreadyRegistered = 1,
    /// Endpoint id is not registered.
    UnknownEndpoint = 2,
    /// Caller is not the provider that registered this endpoint.
    NotProvider = 3,
    /// Price must be greater than zero.
    ZeroPrice = 4,
}

/// Emitted once when a provider registers a paid endpoint.
#[odra::event]
pub struct EndpointRegistered {
    /// Stable endpoint identifier, e.g. "quote" or "insight".
    pub endpoint_id: String,
    /// Provider (payee) that owns the endpoint.
    pub provider: Address,
    /// Initial price in token motes.
    pub initial_price: U256,
}

/// Emitted on every price change decided by the pricing agent.
#[odra::event]
pub struct PriceAttested {
    /// Endpoint identifier.
    pub endpoint_id: String,
    /// Price before this attestation, in token motes.
    pub old_price: U256,
    /// Newly attested price, in token motes.
    pub new_price: U256,
    /// Hex sha256 of the demand-window stats that justified the move.
    pub stats_hash: String,
    /// Monotonic per-endpoint sequence number (1-based).
    pub seq: u64,
    /// Block time of the attestation (ms since epoch).
    pub block_time: u64,
}

/// Registry of x402 endpoints and their attested prices.
#[odra::module(events = [EndpointRegistered, PriceAttested], errors = Error)]
pub struct PriceRegistry {
    /// endpoint_id -> provider address that may attest for it.
    providers: Mapping<String, Address>,
    /// endpoint_id -> currently attested price (token motes).
    prices: Mapping<String, U256>,
    /// endpoint_id -> number of attestations recorded (seq counter).
    attestations: Mapping<String, u64>,
    /// Total endpoints registered (for quick dashboards).
    endpoint_count: Var<u64>,
}

#[odra::module]
impl PriceRegistry {
    /// Initializes the registry.
    pub fn init(&mut self) {
        self.endpoint_count.set(0);
    }

    /// Registers a new paid endpoint. The caller becomes its provider.
    pub fn register_endpoint(&mut self, endpoint_id: String, initial_price: U256) {
        if self.providers.get(&endpoint_id).is_some() {
            self.env().revert(Error::AlreadyRegistered);
        }
        if initial_price.is_zero() {
            self.env().revert(Error::ZeroPrice);
        }
        let caller = self.env().caller();
        self.providers.set(&endpoint_id, caller);
        self.prices.set(&endpoint_id, initial_price);
        self.attestations.set(&endpoint_id, 0);
        self.endpoint_count
            .set(self.endpoint_count.get_or_default() + 1);

        self.env().emit_event(EndpointRegistered {
            endpoint_id,
            provider: caller,
            initial_price,
        });
    }

    /// Attests a new price for an endpoint. Only the registering provider
    /// may call this. Emits `PriceAttested`.
    pub fn attest_price(&mut self, endpoint_id: String, new_price: U256, stats_hash: String) {
        let provider = match self.providers.get(&endpoint_id) {
            Some(p) => p,
            None => self.env().revert(Error::UnknownEndpoint),
        };
        if self.env().caller() != provider {
            self.env().revert(Error::NotProvider);
        }
        if new_price.is_zero() {
            self.env().revert(Error::ZeroPrice);
        }

        let old_price = self.prices.get(&endpoint_id).unwrap_or_default();
        let seq = self.attestations.get(&endpoint_id).unwrap_or_default() + 1;

        self.prices.set(&endpoint_id, new_price);
        self.attestations.set(&endpoint_id, seq);

        self.env().emit_event(PriceAttested {
            endpoint_id,
            old_price,
            new_price,
            stats_hash,
            seq,
            block_time: self.env().get_block_time(),
        });
    }

    /// Returns the currently attested price for an endpoint, if registered.
    pub fn get_price(&self, endpoint_id: String) -> Option<U256> {
        self.prices.get(&endpoint_id)
    }

    /// Returns the provider for an endpoint, if registered.
    pub fn get_provider(&self, endpoint_id: String) -> Option<Address> {
        self.providers.get(&endpoint_id)
    }

    /// Returns how many attestations exist for an endpoint.
    pub fn attestation_count(&self, endpoint_id: String) -> u64 {
        self.attestations.get(&endpoint_id).unwrap_or_default()
    }

    /// Returns how many endpoints are registered.
    pub fn endpoint_count(&self) -> u64 {
        self.endpoint_count.get_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    fn price(n: u64) -> U256 {
        U256::from(n)
    }

    #[test]
    fn register_and_read() {
        let env = odra_test::env();
        let mut c = PriceRegistry::deploy(&env, NoArgs);

        c.register_endpoint("quote".to_string(), price(1_000_000_000));
        assert_eq!(c.get_price("quote".to_string()), Some(price(1_000_000_000)));
        assert_eq!(c.get_provider("quote".to_string()), Some(env.get_account(0)));
        assert_eq!(c.endpoint_count(), 1);
        assert_eq!(c.attestation_count("quote".to_string()), 0);
    }

    #[test]
    fn attest_updates_price_and_seq() {
        let env = odra_test::env();
        let mut c = PriceRegistry::deploy(&env, NoArgs);
        c.register_endpoint("quote".to_string(), price(1_000_000_000));

        c.attest_price(
            "quote".to_string(),
            price(2_000_000_000),
            "abc123".to_string(),
        );
        assert_eq!(c.get_price("quote".to_string()), Some(price(2_000_000_000)));
        assert_eq!(c.attestation_count("quote".to_string()), 1);

        c.attest_price(
            "quote".to_string(),
            price(3_000_000_000),
            "def456".to_string(),
        );
        assert_eq!(c.attestation_count("quote".to_string()), 2);
    }

    #[test]
    fn only_provider_can_attest() {
        let env = odra_test::env();
        let mut c = PriceRegistry::deploy(&env, NoArgs);
        c.register_endpoint("quote".to_string(), price(1_000_000_000));

        env.set_caller(env.get_account(1));
        let result = c.try_attest_price(
            "quote".to_string(),
            price(9_000_000_000),
            "evil".to_string(),
        );
        assert!(result.is_err());
        // Price unchanged.
        assert_eq!(c.get_price("quote".to_string()), Some(price(1_000_000_000)));
    }

    #[test]
    fn cannot_register_twice_or_zero() {
        let env = odra_test::env();
        let mut c = PriceRegistry::deploy(&env, NoArgs);
        c.register_endpoint("quote".to_string(), price(1));
        assert!(c
            .try_register_endpoint("quote".to_string(), price(2))
            .is_err());
        assert!(c
            .try_register_endpoint("other".to_string(), price(0))
            .is_err());
        assert!(c
            .try_attest_price("missing".to_string(), price(1), "h".to_string())
            .is_err());
    }
}
