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
//!
//! # NAPI Bindings
//!
//! When compiled with the `napi` feature, this crate provides native Node.js bindings
//! for efficient Channel A verification from TypeScript:
//!
//! ```typescript
//! import { verifyProposal, canonicalizeProposal, calculateFriction } from '@ai-constitution-dao/core';
//!
//! const verdict = verifyProposal(
//!   'rProposerAddress',
//!   '{"action": "test"}',
//!   'Test proposal',
//!   'L2Operational'
//! );
//! ```

pub mod types;
pub mod channel_a;

#[cfg(feature = "napi")]
pub mod napi;

pub use types::*;
pub use channel_a::verify_proposal;

// Re-export NAPI bindings when feature is enabled
#[cfg(feature = "napi")]
pub use napi::*;
