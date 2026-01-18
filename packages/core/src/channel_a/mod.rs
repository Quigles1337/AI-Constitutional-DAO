//! Channel A: Deterministic Hard Gate
//!
//! Channel A performs computationally reproducible checks. Its verdicts are binary
//! (PASS/FAIL) and act as a hard gate on proposals. An incorrect verdict can be
//! challenged via an on-chain fraud proof, leading to slashing of the malicious oracle.
//!
//! # Components
//!
//! - `canonicalize`: Produces deterministic representation of proposals
//! - `complexity`: Measures proposal complexity via zlib compression
//! - `paradox`: Detects self-referential paradoxes via regex
//! - `cycles`: Detects dependency cycles via Tarjan's SCC algorithm

mod canonicalize;
mod complexity;
mod paradox;
mod cycles;

pub use canonicalize::{canonicalize, CanonicalPayload};
pub use complexity::{compute_complexity, check_complexity};
pub use paradox::detect_paradox;
pub use cycles::detect_cycles;

use crate::types::{ChannelAVerdict, Proposal, config};

/// Verify a proposal through the full Channel A pipeline
///
/// # Process (from spec v5.0)
///
/// 1. Canonicalize(ProposalTransaction) -> (CanonicalPayloadBytes, CanonicalHash)
/// 2. ComputeComplexity(CanonicalPayloadBytes) -> complexity_score
/// 3. DetectParadox(CanonicalPayloadBytes) -> paradox_found
/// 4. DetectCycles(CanonicalPayloadBytes) -> cycle_found
/// 5. If complexity_score > MAX_COMPLEXITY OR paradox_found OR cycle_found: FAIL
/// 6. Else: PASS
///
/// # Example
///
/// ```
/// use constitution_dao_core::{verify_proposal, Proposal, GovernanceLayer};
///
/// let proposal = Proposal::new(
///     "rXXXXXXXX".to_string(),
///     r#"{"action": "transfer", "amount": 100}"#.to_string(),
///     "Transfer 100 tokens to the community fund".to_string(),
///     GovernanceLayer::L2Operational,
/// );
///
/// let verdict = verify_proposal(&proposal);
/// assert!(verdict.pass);
/// ```
pub fn verify_proposal(proposal: &Proposal) -> ChannelAVerdict {
    // Step 1: Canonicalize
    let canonical = match canonicalize(proposal) {
        Ok(c) => c,
        Err(_) => {
            // Canonicalization failure is a hard fail
            return ChannelAVerdict::fail(0, false, false);
        }
    };

    // Step 2: Compute complexity
    let complexity_score = compute_complexity(&canonical.bytes);

    // Step 3: Detect paradoxes
    let paradox_found = detect_paradox(&proposal.text);

    // Step 4: Detect cycles
    let cycle_found = detect_cycles(&proposal.logic_ast).unwrap_or(false);

    // Step 5-6: Determine pass/fail
    let pass = complexity_score <= config::MAX_COMPLEXITY
        && !paradox_found
        && !cycle_found;

    if pass {
        ChannelAVerdict::pass(complexity_score)
    } else {
        ChannelAVerdict::fail(complexity_score, paradox_found, cycle_found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::GovernanceLayer;

    #[test]
    fn test_simple_proposal_passes() {
        let proposal = Proposal::new(
            "rTestAddress123".to_string(),
            r#"{"action": "transfer", "amount": 100}"#.to_string(),
            "Transfer 100 tokens to the community fund".to_string(),
            GovernanceLayer::L2Operational,
        );

        let verdict = verify_proposal(&proposal);
        assert!(verdict.pass);
        assert!(!verdict.paradox_found);
        assert!(!verdict.cycle_found);
        // Complexity should be reasonable for a simple proposal
        assert!(verdict.complexity_score < config::MAX_COMPLEXITY);
    }

    #[test]
    fn test_paradox_proposal_fails() {
        let proposal = Proposal::new(
            "rTestAddress123".to_string(),
            r#"{"action": "conditional"}"#.to_string(),
            "This proposal passes iff it fails".to_string(),
            GovernanceLayer::L2Operational,
        );

        let verdict = verify_proposal(&proposal);
        assert!(!verdict.pass);
        assert!(verdict.paradox_found);
    }

    #[test]
    fn test_spec_test_vector_paradox() {
        // From Appendix A.3 test vector
        let proposal = Proposal::new(
            "rTestAddress123".to_string(),
            r#"{}"#.to_string(),
            "This proposal passes iff it fails.".to_string(),
            GovernanceLayer::L2Operational,
        );

        let verdict = verify_proposal(&proposal);
        assert!(verdict.paradox_found);
    }
}
