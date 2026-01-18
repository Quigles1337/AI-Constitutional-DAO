//! Canonical Proposal Representation (v5.1 Patch)
//!
//! From Appendix A.1 of the spec:
//!
//! To ensure both a stable identifier and a meaningful complexity score,
//! we define two separate canonical forms derived from the same payload:
//!
//! 1. AST Serialization: Parse logic into AST, serialize to canonical JSON with sorted keys
//! 2. Text Normalization: Lowercase, remove punctuation, normalize whitespace
//! 3. Canonical Payload: serialized_ast_json + "." + normalized_text
//! 4. Canonical Hash: sha256(CanonicalPayloadBytes)

use sha2::{Sha256, Digest};
use serde_json::Value;
use thiserror::Error;

use crate::types::Proposal;

/// Errors that can occur during canonicalization
#[derive(Debug, Error)]
pub enum CanonicalizeError {
    #[error("Failed to parse logic AST as JSON: {0}")]
    JsonParseError(#[from] serde_json::Error),
    #[error("Invalid UTF-8 in payload")]
    Utf8Error,
}

/// The canonical representation of a proposal
#[derive(Debug, Clone)]
pub struct CanonicalPayload {
    /// The canonical payload bytes (AST + "." + normalized_text)
    pub bytes: Vec<u8>,
    /// SHA-256 hash of the payload (serves as proposal ID)
    pub hash: [u8; 32],
}

impl CanonicalPayload {
    /// Get the hash as a hex string
    pub fn hash_hex(&self) -> String {
        hex::encode(self.hash)
    }
}

/// Canonicalize a proposal into deterministic representation
///
/// # Process
///
/// 1. Parse logic_ast as JSON and sort all keys alphabetically (recursive)
/// 2. Normalize text: lowercase, remove punctuation, single spaces
/// 3. Combine: sorted_ast_json + "." + normalized_text
/// 4. Hash with SHA-256
///
/// # Example
///
/// ```
/// use constitution_dao_core::channel_a::{canonicalize, CanonicalPayload};
/// use constitution_dao_core::{Proposal, GovernanceLayer};
///
/// let proposal = Proposal::new(
///     "rAddr".to_string(),
///     r#"{"b": 2, "a": 1}"#.to_string(),
///     "Hello, World!".to_string(),
///     GovernanceLayer::L2Operational,
/// );
///
/// let canonical = canonicalize(&proposal).unwrap();
/// // AST will be sorted: {"a":1,"b":2}
/// // Text will be normalized: "hello world"
/// ```
pub fn canonicalize(proposal: &Proposal) -> Result<CanonicalPayload, CanonicalizeError> {
    // Step 1: Parse and sort AST JSON
    let ast: Value = serde_json::from_str(&proposal.logic_ast)?;
    let sorted_ast = sort_json_keys(&ast);
    let ast_bytes = serde_json::to_vec(&sorted_ast)?;

    // Step 2: Normalize text
    let normalized_text = normalize_text(&proposal.text);

    // Step 3: Combine payload
    let mut payload = ast_bytes;
    payload.push(b'.');
    payload.extend(normalized_text.as_bytes());

    // Step 4: Compute hash
    let hash: [u8; 32] = Sha256::digest(&payload).into();

    Ok(CanonicalPayload {
        bytes: payload,
        hash,
    })
}

/// Recursively sort all keys in a JSON value
fn sort_json_keys(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            // Collect keys, sort them, and rebuild the object
            let mut sorted: serde_json::Map<String, Value> = serde_json::Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();

            for key in keys {
                sorted.insert(key.clone(), sort_json_keys(&map[key]));
            }
            Value::Object(sorted)
        }
        Value::Array(arr) => {
            Value::Array(arr.iter().map(sort_json_keys).collect())
        }
        // Primitives pass through unchanged
        other => other.clone()
    }
}

/// Normalize text for canonical representation
///
/// - Convert to lowercase
/// - Remove all punctuation
/// - Normalize whitespace to single spaces
/// - Trim leading/trailing whitespace
fn normalize_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter_map(|c| {
            if c.is_alphanumeric() {
                Some(c)
            } else if c.is_whitespace() {
                Some(' ')
            } else {
                // Remove punctuation
                None
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::GovernanceLayer;

    #[test]
    fn test_sort_json_keys() {
        let input: Value = serde_json::from_str(r#"{"z": 1, "a": 2, "m": {"y": 3, "b": 4}}"#).unwrap();
        let sorted = sort_json_keys(&input);
        let output = serde_json::to_string(&sorted).unwrap();
        assert_eq!(output, r#"{"a":2,"m":{"b":4,"y":3},"z":1}"#);
    }

    #[test]
    fn test_normalize_text() {
        assert_eq!(normalize_text("Hello, World!"), "hello world");
        assert_eq!(normalize_text("  Multiple   spaces  "), "multiple spaces");
        assert_eq!(normalize_text("This is a test."), "this is a test");
        assert_eq!(normalize_text("UPPERCASE lowercase MiXeD"), "uppercase lowercase mixed");
    }

    #[test]
    fn test_canonicalize_deterministic() {
        let proposal1 = Proposal::new(
            "rAddr".to_string(),
            r#"{"b": 2, "a": 1}"#.to_string(),
            "Hello, World!".to_string(),
            GovernanceLayer::L2Operational,
        );

        let proposal2 = Proposal::new(
            "rAddr".to_string(),
            r#"{"a": 1, "b": 2}"#.to_string(),
            "HELLO, WORLD!".to_string(),
            GovernanceLayer::L2Operational,
        );

        let c1 = canonicalize(&proposal1).unwrap();
        let c2 = canonicalize(&proposal2).unwrap();

        // Same canonical representation despite different input ordering/casing
        assert_eq!(c1.hash, c2.hash);
    }

    #[test]
    fn test_canonical_payload_format() {
        let proposal = Proposal::new(
            "rAddr".to_string(),
            r#"{"action": "test"}"#.to_string(),
            "Test proposal".to_string(),
            GovernanceLayer::L2Operational,
        );

        let canonical = canonicalize(&proposal).unwrap();
        let payload_str = String::from_utf8(canonical.bytes.clone()).unwrap();

        // Should be: sorted_json + "." + normalized_text
        assert!(payload_str.contains("."));
        assert!(payload_str.ends_with("test proposal"));
    }
}
