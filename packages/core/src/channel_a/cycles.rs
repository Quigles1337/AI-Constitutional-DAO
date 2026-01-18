//! Cycle Detection
//!
//! From Appendix A.4 of the spec:
//!
//! - Graph Extraction: Parse AST to build directed dependency graph
//! - Algorithm: Tarjan's strongly connected components algorithm
//! - Output: cycle_found = true if any component contains >1 node or self-edge

use petgraph::algo::tarjan_scc;
use petgraph::graph::{DiGraph, NodeIndex};
use serde_json::Value;
use std::collections::HashMap;
use thiserror::Error;

/// Errors that can occur during cycle detection
#[derive(Debug, Error)]
pub enum CycleDetectionError {
    #[error("Failed to parse AST as JSON: {0}")]
    JsonParseError(#[from] serde_json::Error),
    #[error("Invalid AST structure")]
    InvalidAstStructure,
}

/// Detect cycles in proposal logic by analyzing the AST
///
/// Extracts a dependency graph from the AST and uses Tarjan's algorithm
/// to find strongly connected components (SCCs). A cycle exists if:
/// - Any SCC has more than one node, OR
/// - Any node has a self-edge
///
/// # AST Format
///
/// The AST should be a JSON object where:
/// - Keys are variable/state names
/// - Values can reference other variables via `$ref` or `depends_on`
///
/// # Example
///
/// ```
/// use constitution_dao_core::channel_a::detect_cycles;
///
/// // No cycles
/// let ast = r#"{"a": {"value": 1}, "b": {"value": "$ref:a"}}"#;
/// assert!(!detect_cycles(ast).unwrap());
///
/// // Self-reference cycle
/// let ast = r#"{"a": {"value": "$ref:a"}}"#;
/// assert!(detect_cycles(ast).unwrap());
/// ```
pub fn detect_cycles(ast_json: &str) -> Result<bool, CycleDetectionError> {
    let ast: Value = serde_json::from_str(ast_json)?;
    let graph = extract_dependency_graph(&ast)?;

    // Run Tarjan's SCC algorithm
    let sccs = tarjan_scc(&graph);

    // Check for cycles
    for scc in sccs {
        // SCC with >1 node means a cycle
        if scc.len() > 1 {
            return Ok(true);
        }

        // Single node with self-edge is also a cycle
        if scc.len() == 1 {
            let node = scc[0];
            if graph.contains_edge(node, node) {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

/// Extract a directed dependency graph from an AST
///
/// Nodes are variable/state names.
/// Edges represent dependencies (A -> B means A depends on B).
fn extract_dependency_graph(ast: &Value) -> Result<DiGraph<String, ()>, CycleDetectionError> {
    let mut graph = DiGraph::new();
    let mut node_indices: HashMap<String, NodeIndex> = HashMap::new();

    // First pass: create nodes for all top-level keys
    if let Value::Object(map) = ast {
        for key in map.keys() {
            let idx = graph.add_node(key.clone());
            node_indices.insert(key.clone(), idx);
        }

        // Second pass: add edges for dependencies
        for (key, value) in map.iter() {
            let from_idx = node_indices[key];
            let deps = extract_dependencies(value);

            for dep in deps {
                // Only add edge if the dependency exists as a node
                if let Some(&to_idx) = node_indices.get(&dep) {
                    graph.add_edge(from_idx, to_idx, ());
                }
            }
        }
    }

    Ok(graph)
}

/// Extract variable references from a JSON value
///
/// Looks for:
/// - `$ref:varname` strings
/// - `depends_on: [...]` arrays
/// - `references: varname` fields
fn extract_dependencies(value: &Value) -> Vec<String> {
    let mut deps = Vec::new();

    match value {
        Value::String(s) => {
            // Check for $ref:varname pattern
            if let Some(varname) = s.strip_prefix("$ref:") {
                deps.push(varname.to_string());
            }
        }
        Value::Object(map) => {
            // Check for explicit dependency fields
            if let Some(Value::Array(arr)) = map.get("depends_on") {
                for item in arr {
                    if let Value::String(s) = item {
                        deps.push(s.clone());
                    }
                }
            }
            if let Some(Value::String(s)) = map.get("references") {
                deps.push(s.clone());
            }
            if let Some(Value::String(s)) = map.get("ref") {
                deps.push(s.clone());
            }

            // Recursively check all values
            for v in map.values() {
                deps.extend(extract_dependencies(v));
            }
        }
        Value::Array(arr) => {
            for item in arr {
                deps.extend(extract_dependencies(item));
            }
        }
        _ => {}
    }

    deps
}

/// Get detailed information about cycles found in the AST
pub fn find_cycles_detail(ast_json: &str) -> Result<Vec<Vec<String>>, CycleDetectionError> {
    let ast: Value = serde_json::from_str(ast_json)?;
    let graph = extract_dependency_graph(&ast)?;
    let sccs = tarjan_scc(&graph);

    let mut cycles = Vec::new();

    for scc in sccs {
        if scc.len() > 1 {
            // Multi-node SCC
            let cycle: Vec<String> = scc.iter()
                .map(|&idx| graph[idx].clone())
                .collect();
            cycles.push(cycle);
        } else if scc.len() == 1 {
            let node = scc[0];
            if graph.contains_edge(node, node) {
                // Self-reference
                cycles.push(vec![graph[node].clone()]);
            }
        }
    }

    Ok(cycles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_cycles() {
        let ast = r#"{
            "a": {"value": 1},
            "b": {"value": "$ref:a"},
            "c": {"value": "$ref:b"}
        }"#;

        assert!(!detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_self_reference() {
        let ast = r#"{
            "a": {"value": "$ref:a"}
        }"#;

        assert!(detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_two_node_cycle() {
        let ast = r#"{
            "a": {"value": "$ref:b"},
            "b": {"value": "$ref:a"}
        }"#;

        assert!(detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_three_node_cycle() {
        let ast = r#"{
            "a": {"value": "$ref:b"},
            "b": {"value": "$ref:c"},
            "c": {"value": "$ref:a"}
        }"#;

        assert!(detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_depends_on_array() {
        let ast = r#"{
            "a": {"depends_on": ["b"]},
            "b": {"depends_on": ["a"]}
        }"#;

        assert!(detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_complex_acyclic() {
        let ast = r#"{
            "root": {"depends_on": ["a", "b"]},
            "a": {"depends_on": ["c"]},
            "b": {"depends_on": ["c"]},
            "c": {"value": 1}
        }"#;

        assert!(!detect_cycles(ast).unwrap());
    }

    #[test]
    fn test_empty_ast() {
        assert!(!detect_cycles("{}").unwrap());
    }

    #[test]
    fn test_find_cycles_detail() {
        let ast = r#"{
            "a": {"value": "$ref:b"},
            "b": {"value": "$ref:a"},
            "c": {"value": "$ref:c"}
        }"#;

        let cycles = find_cycles_detail(ast).unwrap();
        assert_eq!(cycles.len(), 2);
    }

    #[test]
    fn test_reference_to_nonexistent() {
        // Reference to non-existent variable should not cause issues
        let ast = r#"{
            "a": {"value": "$ref:nonexistent"}
        }"#;

        assert!(!detect_cycles(ast).unwrap());
    }
}
