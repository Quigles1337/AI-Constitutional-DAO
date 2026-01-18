//! NAPI bindings for Node.js integration
//!
//! Provides native bindings for calling Channel A verification from TypeScript.
//! Uses napi-rs for efficient, type-safe FFI.

#[cfg(feature = "napi")]
use napi::bindgen_prelude::*;
#[cfg(feature = "napi")]
use napi_derive::napi;

use crate::channel_a::{canonicalize, compute_complexity, detect_cycles, detect_paradox};
use crate::types::{
    ChannelAVerdict as RustChannelAVerdict, FrictionParams as RustFrictionParams,
    GovernanceLayer as RustGovernanceLayer, Proposal as RustProposal,
};

/// JavaScript-compatible Channel A verdict
#[cfg(feature = "napi")]
#[napi(object)]
pub struct ChannelAVerdict {
    /// Whether the proposal passed all Channel A checks
    pub pass: bool,
    /// Complexity score (zlib compressed size of canonical payload)
    pub complexity_score: i64,
    /// Whether a logical paradox was detected
    pub paradox_found: bool,
    /// Whether a dependency cycle was detected
    pub cycle_found: bool,
}

#[cfg(feature = "napi")]
impl From<RustChannelAVerdict> for ChannelAVerdict {
    fn from(v: RustChannelAVerdict) -> Self {
        Self {
            pass: v.pass,
            complexity_score: v.complexity_score as i64,
            paradox_found: v.paradox_found,
            cycle_found: v.cycle_found,
        }
    }
}

/// JavaScript-compatible canonical payload result
#[cfg(feature = "napi")]
#[napi(object)]
pub struct CanonicalResult {
    /// Canonical payload as hex-encoded string
    pub payload_hex: String,
    /// SHA-256 hash as hex-encoded string (proposal ID)
    pub hash: String,
    /// Payload length in bytes
    pub length: i64,
}

/// JavaScript-compatible friction parameters
#[cfg(feature = "napi")]
#[napi(object)]
pub struct FrictionParams {
    /// Required quorum (base * multiplier)
    pub required_quorum: f64,
    /// Timelock duration in seconds
    pub timelock_duration: i64,
    /// The alignment score used
    pub alignment_score: f64,
    /// Quorum multiplier (1.0 to 1.5)
    pub quorum_multiplier: f64,
    /// Timelock multiplier (1.0 to 3.0)
    pub timelock_multiplier: f64,
}

#[cfg(feature = "napi")]
impl From<RustFrictionParams> for FrictionParams {
    fn from(p: RustFrictionParams) -> Self {
        Self {
            required_quorum: p.required_quorum,
            timelock_duration: p.timelock_duration as i64,
            alignment_score: p.alignment_score,
            quorum_multiplier: p.quorum_multiplier,
            timelock_multiplier: p.timelock_multiplier,
        }
    }
}

/// Governance layer enum for JavaScript
#[cfg(feature = "napi")]
#[napi(string_enum)]
pub enum GovernanceLayer {
    L0Immutable,
    L1Constitutional,
    L2Operational,
    L3Execution,
}

#[cfg(feature = "napi")]
impl From<GovernanceLayer> for RustGovernanceLayer {
    fn from(layer: GovernanceLayer) -> Self {
        match layer {
            GovernanceLayer::L0Immutable => RustGovernanceLayer::L0Immutable,
            GovernanceLayer::L1Constitutional => RustGovernanceLayer::L1Constitutional,
            GovernanceLayer::L2Operational => RustGovernanceLayer::L2Operational,
            GovernanceLayer::L3Execution => RustGovernanceLayer::L3Execution,
        }
    }
}

/// Verify a proposal through the full Channel A pipeline
///
/// This is the main entry point for Channel A verification from Node.js.
///
/// @param proposer - XRPL address of the proposer
/// @param logic_ast - JSON AST of the proposal logic
/// @param text - Natural language description
/// @param layer - Governance layer (L0Immutable, L1Constitutional, L2Operational, L3Execution)
/// @returns Channel A verdict with pass/fail and details
#[cfg(feature = "napi")]
#[napi]
pub fn verify_proposal(
    proposer: String,
    logic_ast: String,
    text: String,
    layer: GovernanceLayer,
) -> Result<ChannelAVerdict> {
    let proposal = RustProposal::new(proposer, logic_ast, text, layer.into());
    let verdict = crate::channel_a::verify_proposal(&proposal);
    Ok(verdict.into())
}

/// Verify a proposal from JSON input
///
/// @param proposal_json - JSON string containing proposal data
/// @returns Channel A verdict
#[cfg(feature = "napi")]
#[napi]
pub fn verify_proposal_json(proposal_json: String) -> Result<ChannelAVerdict> {
    let proposal: RustProposal =
        serde_json::from_str(&proposal_json).map_err(|e| Error::from_reason(e.to_string()))?;
    let verdict = crate::channel_a::verify_proposal(&proposal);
    Ok(verdict.into())
}

/// Canonicalize a proposal and return the canonical payload
///
/// @param proposer - XRPL address
/// @param logic_ast - JSON AST
/// @param text - Natural language description
/// @param layer - Governance layer
/// @returns Canonical result with payload hash and hex encoding
#[cfg(feature = "napi")]
#[napi]
pub fn canonicalize_proposal(
    proposer: String,
    logic_ast: String,
    text: String,
    layer: GovernanceLayer,
) -> Result<CanonicalResult> {
    let proposal = RustProposal::new(proposer, logic_ast, text, layer.into());

    let canonical =
        canonicalize(&proposal).map_err(|e| Error::from_reason(format!("Canonicalization failed: {}", e)))?;

    Ok(CanonicalResult {
        payload_hex: hex::encode(&canonical.bytes),
        hash: hex::encode(canonical.hash),
        length: canonical.bytes.len() as i64,
    })
}

/// Compute complexity score for a payload
///
/// Uses zlib compression level 9 to measure Kolmogorov complexity proxy.
///
/// @param payload_hex - Hex-encoded payload bytes
/// @returns Complexity score (compressed size in bytes)
#[cfg(feature = "napi")]
#[napi]
pub fn compute_complexity_score(payload_hex: String) -> Result<i64> {
    let bytes = hex::decode(&payload_hex).map_err(|e| Error::from_reason(e.to_string()))?;
    let score = compute_complexity(&bytes);
    Ok(score as i64)
}

/// Detect paradoxes in proposal text
///
/// Uses regex patterns to detect self-referential paradoxes like:
/// - "This proposal passes iff it fails"
/// - "This statement is false"
///
/// @param text - Natural language proposal text
/// @returns true if a paradox is detected
#[cfg(feature = "napi")]
#[napi]
pub fn detect_paradox_in_text(text: String) -> bool {
    detect_paradox(&text)
}

/// Detect cycles in proposal logic AST
///
/// Uses Tarjan's strongly connected components algorithm.
///
/// @param logic_ast - JSON AST of proposal logic
/// @returns true if a cycle is detected
#[cfg(feature = "napi")]
#[napi]
pub fn detect_cycles_in_ast(logic_ast: String) -> Result<bool> {
    detect_cycles(&logic_ast).map_err(|e| Error::from_reason(e.to_string()))
}

/// Calculate friction parameters from alignment score
///
/// From spec v5.0:
/// - Quorum Multiplier: 1.0 + (1.0 - alignment_score) * 0.5
/// - Timelock Multiplier: 1.0 + (1.0 - alignment_score) * 2.0
///
/// @param alignment_score - Semantic alignment score from Channel B (0.0 to 1.0)
/// @returns Friction parameters
#[cfg(feature = "napi")]
#[napi]
pub fn calculate_friction(alignment_score: f64) -> FrictionParams {
    RustFrictionParams::from_alignment_score(alignment_score).into()
}

/// Get the maximum allowed complexity score
///
/// @returns MAX_COMPLEXITY constant (10,000)
#[cfg(feature = "napi")]
#[napi]
pub fn get_max_complexity() -> i64 {
    crate::types::config::MAX_COMPLEXITY as i64
}

/// Get the oracle bond amount in drops
///
/// @returns ORACLE_BOND constant as string (100,000 XRP = 100000000000 drops)
#[cfg(feature = "napi")]
#[napi]
pub fn get_oracle_bond() -> String {
    crate::types::config::ORACLE_BOND.to_string()
}

/// Get the active oracle set size
///
/// @returns ACTIVE_ORACLE_SET_SIZE constant (101)
#[cfg(feature = "napi")]
#[napi]
pub fn get_active_oracle_set_size() -> i64 {
    crate::types::config::ACTIVE_ORACLE_SET_SIZE as i64
}

/// Get the jury size
///
/// @returns JURY_SIZE constant (21)
#[cfg(feature = "napi")]
#[napi]
pub fn get_jury_size() -> i64 {
    crate::types::config::JURY_SIZE as i64
}

/// Get the jury voting period in seconds
///
/// @returns JURY_VOTING_PERIOD constant (72 hours = 259200 seconds)
#[cfg(feature = "napi")]
#[napi]
pub fn get_jury_voting_period() -> i64 {
    crate::types::config::JURY_VOTING_PERIOD as i64
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(feature = "napi")]
    fn test_verify_proposal() {
        use super::*;

        let result = verify_proposal(
            "rTestAddress".to_string(),
            r#"{"action": "test"}"#.to_string(),
            "A simple test proposal".to_string(),
            GovernanceLayer::L2Operational,
        );

        assert!(result.is_ok());
        let verdict = result.unwrap();
        assert!(verdict.pass);
    }

    #[test]
    #[cfg(feature = "napi")]
    fn test_paradox_detection() {
        use super::*;

        assert!(detect_paradox_in_text(
            "This proposal passes iff it fails".to_string()
        ));
        assert!(!detect_paradox_in_text(
            "A normal proposal text".to_string()
        ));
    }

    #[test]
    #[cfg(feature = "napi")]
    fn test_friction_calculation() {
        use super::*;

        let params = calculate_friction(1.0);
        assert_eq!(params.quorum_multiplier, 1.0);
        assert_eq!(params.timelock_multiplier, 1.0);

        let params = calculate_friction(0.0);
        assert_eq!(params.quorum_multiplier, 1.5);
        assert_eq!(params.timelock_multiplier, 3.0);
    }
}
