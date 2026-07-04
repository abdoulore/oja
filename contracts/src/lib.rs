#![cfg_attr(not(test), no_std)]
// If your local toolchain complains about no_std with the livenet bins,
// simply delete the line above; it only trims wasm size.
extern crate alloc;

pub mod price_registry;
pub use price_registry::{PriceRegistry, Error, EndpointRegistered, PriceAttested};
