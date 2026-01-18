//! AI Constitution DAO Core
//!
//! This crate provides the core verification logic for the AI Constitution DAO,
//! implementing Channel A (deterministic verification) of the dual-channel oracle system.
//!
//! # Architecture
//!
//! The verification pipeline consists of:
//! - **Canonicalization**: Produces deterministic representation of proposals
//! - **Complexity Scoring**: Uses zlib compression to measure proposal complexity
//! - **Paradox Detection**: Regex-based detection of self-referential paradoxes
//! - **Cycle Detection**: Tarjan's SCC algorithm for dependency cycle detection

pub mod types;
pub mod channel_a;

pub use types::*;
pub use channel_a::verify_proposal;
