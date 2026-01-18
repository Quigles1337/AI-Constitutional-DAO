//! Paradox Detection Rules
//!
//! From Appendix A.3 of the spec:
//!
//! - Engine: re2 regular expression matching on the normalized text
//! - Patterns detect Gödelian self-referential paradoxes
//!
//! # Test Vector
//!
//! - Input: "This proposal passes iff it fails."
//! - Expected Output: paradox_found = true

use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    /// Paradox detection patterns from the spec
    ///
    /// These patterns detect self-referential logical paradoxes that would
    /// make a proposal undecidable or logically inconsistent.
    static ref PARADOX_PATTERNS: Vec<Regex> = vec![
        // Pattern 1: "this proposal/motion passes/fails iff fails/passes"
        // Matches: "This proposal passes iff it fails"
        Regex::new(r"(?i)(this proposal|the motion|this rule|this amendment).*(passes|fails|is true|is false|succeeds|is rejected)\s+(iff|if and only if)\s+.*(fails|passes|is false|is true|is rejected|succeeds)").unwrap(),

        // Pattern 2: "this rule/statement is false"
        // Classic liar paradox
        Regex::new(r"(?i)(this rule|this statement|the following statement|this proposal)\s+(is|are)\s+false").unwrap(),

        // Pattern 3: Conditional self-reference
        // "if this is true then it is false"
        Regex::new(r"(?i)if\s+(this|it).*(true|passes|succeeds).*then.*(false|fails|is rejected)").unwrap(),

        // Pattern 4: Negation loops
        // "this passes only if it doesn't pass"
        Regex::new(r"(?i)(this|it).*(passes|succeeds|is approved)\s+(only if|unless)\s+.*(doesn't|does not|doesn't|not)\s*(pass|succeed|approved)").unwrap(),

        // Pattern 5: Self-contradictory definitions
        // "define X as not-X"
        Regex::new(r"(?i)(define|let|set)\s+(\w+)\s+(as|to be|equal to|=)\s+(not|the opposite of|the negation of)\s+\2").unwrap(),

        // Pattern 6: Russell's paradox variants
        // "the set of all proposals that don't include themselves"
        Regex::new(r"(?i)(set|collection|group)\s+of\s+(all)?\s*(proposals?|rules?|statements?)\s+that\s+(don't|do not|doesn't)\s+(include|contain|reference)\s+(themselves|itself)").unwrap(),
    ];
}

/// Detect if a proposal text contains logical paradoxes
///
/// Searches for Gödelian self-referential patterns that would make
/// the proposal logically undecidable.
///
/// # Example
///
/// ```
/// use constitution_dao_core::channel_a::detect_paradox;
///
/// assert!(detect_paradox("This proposal passes iff it fails"));
/// assert!(detect_paradox("This statement is false"));
/// assert!(!detect_paradox("Transfer 100 tokens to the community fund"));
/// ```
pub fn detect_paradox(text: &str) -> bool {
    PARADOX_PATTERNS.iter().any(|pattern| pattern.is_match(text))
}

/// Get the list of paradox patterns for debugging/display
pub fn get_paradox_patterns() -> Vec<String> {
    PARADOX_PATTERNS.iter().map(|p| p.as_str().to_string()).collect()
}

/// Check which specific paradox pattern(s) matched
pub fn find_paradox_matches(text: &str) -> Vec<(usize, String)> {
    PARADOX_PATTERNS
        .iter()
        .enumerate()
        .filter_map(|(i, pattern)| {
            pattern.find(text).map(|m| (i, m.as_str().to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spec_test_vector() {
        // From Appendix A.3
        assert!(detect_paradox("This proposal passes iff it fails."));
    }

    #[test]
    fn test_liar_paradox() {
        assert!(detect_paradox("This statement is false"));
        assert!(detect_paradox("The following statement is false"));
        assert!(detect_paradox("This rule is false"));
    }

    #[test]
    fn test_conditional_paradox() {
        assert!(detect_paradox("If this is true then it is false"));
        assert!(detect_paradox("If this passes then it fails"));
    }

    #[test]
    fn test_motion_variants() {
        assert!(detect_paradox("The motion passes iff it fails"));
        assert!(detect_paradox("This amendment succeeds iff it is rejected"));
    }

    #[test]
    fn test_normal_proposals_pass() {
        assert!(!detect_paradox("Transfer 100 tokens to the community fund"));
        assert!(!detect_paradox("Increase the quorum to 15%"));
        assert!(!detect_paradox("This proposal aims to improve governance"));
        assert!(!detect_paradox("If the vote passes, execute the transfer"));
    }

    #[test]
    fn test_case_insensitivity() {
        assert!(detect_paradox("THIS PROPOSAL PASSES IFF IT FAILS"));
        assert!(detect_paradox("this proposal passes iff it fails"));
        assert!(detect_paradox("This Proposal Passes Iff It Fails"));
    }

    #[test]
    fn test_find_matches() {
        let matches = find_paradox_matches("This proposal passes iff it fails");
        assert!(!matches.is_empty());

        let matches = find_paradox_matches("Normal proposal text");
        assert!(matches.is_empty());
    }

    #[test]
    fn test_negation_loops() {
        assert!(detect_paradox("This passes only if it doesn't pass"));
    }

    #[test]
    fn test_edge_cases() {
        // Partial matches shouldn't trigger
        assert!(!detect_paradox("passes iff")); // incomplete
        assert!(!detect_paradox("This is a proposal")); // no paradox structure
    }
}
