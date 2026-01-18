//! Core types for the AI Constitution DAO
//!
//! These types implement the specification from v5.0 of the COINjecture AI Constitution DAO.

use serde::{Deserialize, Serialize};

/// Decidability classification for proposals
///
/// Determines how a proposal is routed through the governance pipeline:
/// - Class I: Routed to PoUW Marketplace for formal verification
/// - Class II: Requires Channel A PASS verdict to proceed
/// - Class III: Automatically escalated to Constitutional Jury
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecidabilityClass {
    /// Formally verifiable - route to PoUW miners
    I,
    /// Requires deterministic Channel A check
    II,
    /// Requires human judgment - escalate to jury
    III,
}

impl Default for DecidabilityClass {
    fn default() -> Self {
        DecidabilityClass::II
    }
}

/// Channel A verification verdict (deterministic)
///
/// Binary PASS/FAIL result that acts as a hard gate on proposals.
/// An incorrect verdict can be challenged via on-chain fraud proof.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelAVerdict {
    /// Whether the proposal passed all Channel A checks
    pub pass: bool,
    /// Complexity score (zlib compressed size of canonical payload)
    pub complexity_score: u64,
    /// Whether a logical paradox was detected in the proposal text
    pub paradox_found: bool,
    /// Whether a dependency cycle was detected in the proposal logic
    pub cycle_found: bool,
}

impl ChannelAVerdict {
    /// Create a passing verdict
    pub fn pass(complexity_score: u64) -> Self {
        Self {
            pass: true,
            complexity_score,
            paradox_found: false,
            cycle_found: false,
        }
    }

    /// Create a failing verdict
    pub fn fail(complexity_score: u64, paradox_found: bool, cycle_found: bool) -> Self {
        Self {
            pass: false,
            complexity_score,
            paradox_found,
            cycle_found,
        }
    }
}

/// Channel B verification verdict (heuristic)
///
/// Continuous scores from AI-driven risk assessment.
/// Acts as a soft gate, modifying governance friction.
/// Never slashable for disagreement.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelBVerdict {
    /// Semantic alignment with L0 axioms (0.0 to 1.0)
    pub semantic_alignment_score: f64,
    /// Classification for governance routing
    pub decidability_class: DecidabilityClass,
    /// Optional reasoning from the AI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
}

impl ChannelBVerdict {
    /// Create a new Channel B verdict
    pub fn new(alignment_score: f64, decidability_class: DecidabilityClass) -> Self {
        Self {
            semantic_alignment_score: alignment_score.clamp(0.0, 1.0),
            decidability_class,
            reasoning: None,
        }
    }

    /// Add reasoning to the verdict
    pub fn with_reasoning(mut self, reasoning: String) -> Self {
        self.reasoning = Some(reasoning);
        self
    }
}

/// Governance layer in the four-layer constitutional model
///
/// Lower layers cannot modify higher layers (immutability gradient).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GovernanceLayer {
    /// L0: Immutable Core - Foundational axioms (off-chain verification)
    /// Note: L0 is not directly targetable by proposals
    L0Immutable,
    /// L1: Constitutional Layer - High-level governance rules
    L1Constitutional,
    /// L2: Operational Layer - Day-to-day DAO parameters
    L2Operational,
    /// L3: Execution Layer - Smart contract implementations
    L3Execution,
}

impl Default for GovernanceLayer {
    fn default() -> Self {
        GovernanceLayer::L2Operational
    }
}

/// Status of a proposal in its lifecycle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProposalStatus {
    /// Initial state after submission
    Pending,
    /// Awaiting Channel A deterministic verification
    ChannelAReview,
    /// Awaiting Channel B heuristic assessment
    ChannelBReview,
    /// Active voting period
    Voting,
    /// Escalated to Constitutional Jury
    RequiresHumanReview,
    /// Proposal passed all checks and voting
    Passed,
    /// Proposal rejected at some stage
    Rejected,
    /// Proposal has been executed on-chain
    Executed,
}

impl Default for ProposalStatus {
    fn default() -> Self {
        ProposalStatus::Pending
    }
}

/// A governance proposal
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Proposal {
    /// Unique identifier (sha256 of canonical payload)
    pub id: [u8; 32],
    /// XRPL address of the proposer
    pub proposer: String,
    /// Canonical AST JSON of the proposal logic
    pub logic_ast: String,
    /// Natural language description of the proposal
    pub text: String,
    /// Target governance layer
    pub layer: GovernanceLayer,
    /// Unix timestamp of creation
    pub created_at: u64,
    /// Current status in the lifecycle
    pub status: ProposalStatus,
}

impl Proposal {
    /// Create a new proposal (ID will be computed from canonical payload)
    pub fn new(
        proposer: String,
        logic_ast: String,
        text: String,
        layer: GovernanceLayer,
    ) -> Self {
        Self {
            id: [0u8; 32], // Will be set by canonicalization
            proposer,
            logic_ast,
            text,
            layer,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            status: ProposalStatus::Pending,
        }
    }

    /// Set the proposal ID
    pub fn with_id(mut self, id: [u8; 32]) -> Self {
        self.id = id;
        self
    }
}

/// Friction parameters calculated from Channel B alignment score
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrictionParams {
    /// Required quorum (base * multiplier)
    pub required_quorum: f64,
    /// Timelock duration in seconds (base * multiplier)
    pub timelock_duration: u64,
    /// The alignment score used to calculate friction
    pub alignment_score: f64,
    /// Quorum multiplier (1.0 to 1.5)
    pub quorum_multiplier: f64,
    /// Timelock multiplier (1.0 to 3.0)
    pub timelock_multiplier: f64,
}

impl FrictionParams {
    /// Base quorum (10% of voting power)
    pub const BASE_QUORUM: f64 = 0.1;
    /// Base timelock (24 hours in seconds)
    pub const BASE_TIMELOCK: u64 = 86400;

    /// Calculate friction parameters from alignment score
    ///
    /// From spec v5.0:
    /// - Quorum Multiplier: 1.0 + (1.0 - alignment_score) * 0.5
    /// - Timelock Multiplier: 1.0 + (1.0 - alignment_score) * 2.0
    pub fn from_alignment_score(alignment_score: f64) -> Self {
        let score = alignment_score.clamp(0.0, 1.0);
        let quorum_multiplier = 1.0 + (1.0 - score) * 0.5;
        let timelock_multiplier = 1.0 + (1.0 - score) * 2.0;

        Self {
            required_quorum: Self::BASE_QUORUM * quorum_multiplier,
            timelock_duration: (Self::BASE_TIMELOCK as f64 * timelock_multiplier) as u64,
            alignment_score: score,
            quorum_multiplier,
            timelock_multiplier,
        }
    }
}

/// Vote options for proposals
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Vote {
    Yes,
    No,
    Abstain,
}

/// Oracle operator information
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OracleOperator {
    /// XRPL address of the operator
    pub address: String,
    /// Bond amount in drops (1 XRP = 1,000,000 drops)
    pub bond_amount: String,
    /// XRPL escrow sequence number
    pub escrow_sequence: u32,
    /// Unix timestamp of registration
    pub registered_at: u64,
    /// Whether the operator is in the active set
    pub active: bool,
    /// Pending unbond (if any)
    pub unbonding_at: Option<u64>,
}

/// Fraud proof for Channel A misbehavior
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FraudProof {
    /// The proposal being challenged
    pub proposal_id: [u8; 32],
    /// The verdict that was submitted by the oracle
    pub claimed_verdict: ChannelAVerdict,
    /// The correct verdict (recomputed)
    pub actual_verdict: ChannelAVerdict,
    /// Witness data for verification
    pub witness: FraudProofWitness,
}

/// Witness data for fraud proofs
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FraudProofWitness {
    /// The canonical payload bytes (hex encoded)
    pub canonical_payload: String,
    /// Computation trace for debugging
    pub computation_trace: Vec<String>,
}

/// Configuration constants
pub mod config {
    /// Maximum allowed complexity score (from spec)
    pub const MAX_COMPLEXITY: u64 = 10_000;

    /// Oracle bond amount (100,000 XRP equivalent)
    pub const ORACLE_BOND: &str = "100000000000"; // 100,000 XRP in drops

    /// Oracle epoch duration in blocks (~2 weeks)
    pub const ORACLE_EPOCH: u64 = 201_600;

    /// Oracle report window in blocks
    pub const ORACLE_WINDOW: u64 = 1_000;

    /// Slash percentage for non-reveal (15%)
    pub const SLASH_NON_REVEAL: f64 = 0.15;

    /// Jury size
    pub const JURY_SIZE: usize = 21;

    /// Jury voting period (72 hours in seconds)
    pub const JURY_VOTING_PERIOD: u64 = 72 * 60 * 60;

    /// Active oracle set size
    pub const ACTIVE_ORACLE_SET_SIZE: usize = 101;

    /// Required participation quorum for oracles (2/3)
    pub const ORACLE_QUORUM: f64 = 2.0 / 3.0;

    /// Required supermajority for jury (2/3)
    pub const JURY_SUPERMAJORITY: f64 = 2.0 / 3.0;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_friction_params_perfect_alignment() {
        let params = FrictionParams::from_alignment_score(1.0);
        assert_eq!(params.quorum_multiplier, 1.0);
        assert_eq!(params.timelock_multiplier, 1.0);
        assert_eq!(params.required_quorum, 0.1);
        assert_eq!(params.timelock_duration, 86400);
    }

    #[test]
    fn test_friction_params_zero_alignment() {
        let params = FrictionParams::from_alignment_score(0.0);
        assert_eq!(params.quorum_multiplier, 1.5);
        assert_eq!(params.timelock_multiplier, 3.0);
        assert_eq!(params.required_quorum, 0.15);
        assert_eq!(params.timelock_duration, 259200);
    }

    #[test]
    fn test_friction_params_mid_alignment() {
        let params = FrictionParams::from_alignment_score(0.5);
        assert_eq!(params.quorum_multiplier, 1.25);
        assert_eq!(params.timelock_multiplier, 2.0);
    }

    #[test]
    fn test_channel_a_verdict() {
        let pass = ChannelAVerdict::pass(100);
        assert!(pass.pass);
        assert!(!pass.paradox_found);
        assert!(!pass.cycle_found);

        let fail = ChannelAVerdict::fail(15000, true, false);
        assert!(!fail.pass);
        assert!(fail.paradox_found);
    }

    #[test]
    fn test_channel_b_verdict_clamps() {
        let verdict = ChannelBVerdict::new(1.5, DecidabilityClass::II);
        assert_eq!(verdict.semantic_alignment_score, 1.0);

        let verdict = ChannelBVerdict::new(-0.5, DecidabilityClass::II);
        assert_eq!(verdict.semantic_alignment_score, 0.0);
    }
}
