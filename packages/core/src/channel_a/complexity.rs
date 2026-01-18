//! Complexity Scoring Algorithm (v5.1 Patch)
//!
//! From Appendix A.2 of the spec:
//!
//! - Input: CanonicalPayloadBytes from A.1
//! - Algorithm: zlib compression (Level 9, default dictionary)
//! - Score: len(zlib(CanonicalPayloadBytes))
//!
//! The score is derived from compressing the full payload, not its hash.
//!
//! # Test Vector
//!
//! - Input: A simple proposal to transfer 100 tokens
//! - Expected Score: ~75-150 (depending on exact text)

use flate2::Compression;
use flate2::write::ZlibEncoder;
use std::io::Write;

use crate::types::config::MAX_COMPLEXITY;

/// Compute the complexity score of a canonical payload
///
/// Uses zlib compression at maximum level (9) to measure
/// the information content of the proposal.
///
/// # Rationale
///
/// Compression-based complexity measures how much "unique information"
/// is in the proposal. Repetitive or simple proposals compress well,
/// while complex proposals with many unique elements don't compress as much.
///
/// # Example
///
/// ```
/// use constitution_dao_core::channel_a::compute_complexity;
///
/// let simple = b"transfer 100 tokens";
/// let score = compute_complexity(simple);
/// assert!(score < 100);
/// ```
pub fn compute_complexity(payload: &[u8]) -> u64 {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());

    // Write the payload to the encoder
    if encoder.write_all(payload).is_err() {
        // On error, return max complexity (fail-safe)
        return u64::MAX;
    }

    // Finish compression and get the result
    match encoder.finish() {
        Ok(compressed) => compressed.len() as u64,
        Err(_) => u64::MAX,
    }
}

/// Check if a complexity score passes the threshold
///
/// Returns true if the score is within acceptable limits.
#[inline]
pub fn check_complexity(score: u64) -> bool {
    score <= MAX_COMPLEXITY
}

/// Get the maximum allowed complexity score
#[inline]
pub fn max_complexity() -> u64 {
    MAX_COMPLEXITY
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_payload_low_complexity() {
        let payload = b"transfer 100 tokens";
        let score = compute_complexity(payload);

        // Simple text should have low complexity
        assert!(score < 100);
        assert!(check_complexity(score));
    }

    #[test]
    fn test_repetitive_payload_compresses_well() {
        // Repetitive content should compress very well
        let repetitive = "transfer ".repeat(100);
        let score = compute_complexity(repetitive.as_bytes());

        // Even though input is long, compression should be very effective
        assert!(score < 100);
    }

    #[test]
    fn test_random_payload_high_complexity() {
        // Random data doesn't compress well
        let random: Vec<u8> = (0..10000).map(|i| (i * 17 + 31) as u8).collect();
        let score = compute_complexity(&random);

        // Random data should have high complexity
        assert!(score > 5000);
    }

    #[test]
    fn test_spec_test_vector_range() {
        // From Appendix A.2: simple transfer proposal should be ~75-150
        let payload = r#"{"action":"transfer","amount":100}."#.to_string()
            + "transfer 100 tokens to community fund";
        let score = compute_complexity(payload.as_bytes());

        // Should be in the expected range
        assert!(score >= 50 && score <= 200, "Score {} not in expected range", score);
    }

    #[test]
    fn test_empty_payload() {
        let score = compute_complexity(b"");
        // Even empty input produces some overhead from zlib header
        assert!(score > 0);
        assert!(score < 50);
    }

    #[test]
    fn test_check_complexity_boundary() {
        assert!(check_complexity(MAX_COMPLEXITY));
        assert!(check_complexity(MAX_COMPLEXITY - 1));
        assert!(!check_complexity(MAX_COMPLEXITY + 1));
    }
}
