# COINjecture AI Constitution DAO
## v5.0 — Implementation-Ready Specification

**Date:** December 16, 2025

**Author:** Alexander David Zalewski

**Status:** This document provides a consensus-level specification for implementing the AI Constitution DAO on the COINjecture NetB blockchain. It is intended for direct use by core protocol developers.

---

## 1. Introduction & Core Thesis

This document specifies a novel governance framework designed to be resilient against the logical paradoxes and attack surfaces inherent in any complex, self-modifying system. Our core thesis, validated through multiple expert reviews, is:

> **Embrace Incompleteness.** Instead of pursuing the impossible goal of a logically complete and provably consistent on-chain constitution, we design a system that explicitly acknowledges its limitations and builds robust, multi-layered defenses to handle ambiguity, paradox, and undecidability safely.

This specification details the architecture that achieves this, from the foundational four-layer constitutional model to the innovative dual-channel AI oracle that separates deterministic verification from heuristic risk assessment.

---

## 2. High-Level Architecture: The Four Layers

The framework is built on a defense-in-depth architecture with a strict immutability gradient. Lower layers cannot modify higher layers.

| Layer | Name | Description | Verification Method |
|-------|------|-------------|---------------------|
| L0 | Immutable Core | Foundational philosophical and ethical axioms (e.g., "do no harm"). | Axiomatic (Off-chain) |
| L1 | Constitutional Layer | High-level governance rules and principles. | Formal Verification (PoUW) |
| L2 | Operational Layer | Day-to-day DAO parameters (e.g., treasury rules). | Automated (Oracle) |
| L3 | Execution Layer | Smart contracts implementing approved proposals. | Runtime Monitoring |

---

## 3. The Dual-Channel AI Oracle: Consensus-Level Specification

The core innovation is the separation of oracle responsibilities into two distinct, non-overlapping channels.

### 3.1. Channel A: Deterministic Hard Gate

Channel A performs computationally reproducible checks. Its verdicts are binary (PASS/FAIL) and act as a hard gate on proposals. An incorrect verdict can be challenged via an on-chain fraud proof, leading to the slashing of the malicious oracle.

#### 3.1.1. State Machine Logic

- **Input:** `ProposalTransaction`
- **Output:** `ChannelAVerdict { pass: bool, complexity_score: u64, paradox_found: bool, cycle_found: bool }`
- **Process:**
  1. `Canonicalize(ProposalTransaction)` -> `(CanonicalPayloadBytes, CanonicalHash)` (See Appendix A.1)
  2. `ComputeComplexity(CanonicalPayloadBytes)` -> `complexity_score` (See Appendix A.2)
  3. `DetectParadox(CanonicalPayloadBytes)` -> `paradox_found` (See Appendix A.3)
  4. `DetectCycles(CanonicalPayloadBytes)` -> `cycle_found` (See Appendix A.4)
  5. If `complexity_score > MAX_COMPLEXITY` OR `paradox_found` OR `cycle_found`, set `pass = false`.
  6. Else, set `pass = true`.
  7. Return `ChannelAVerdict`.

### 3.2. Channel B: Heuristic Soft Gate

Channel B performs non-deterministic, AI-driven risk assessments. Its verdicts are continuous scores that act as a soft gate, modifying governance friction. Its verdicts are never slashable for disagreement, only for non-participation.

#### 3.2.1. State Machine Logic

- **Input:** `ProposalTransaction`
- **Output:** `ChannelBVerdict { semantic_alignment_score: f64, decidability_class: Enum }`
- **Process:**
  1. `ComputeSemanticAlignment(ProposalTransaction.text)` -> `semantic_alignment_score` (0.0 to 1.0)
  2. `ClassifyDecidability(ProposalTransaction.logic)` -> `decidability_class` (I, II, or III)
  3. Return `ChannelBVerdict`.

### 3.3. Decidability Class Routing

The `decidability_class` output from Channel B serves as an explicit on-chain routing rule for the governance pipeline:

- If `decidability_class == I`: The proposal is routed to the PoUW Marketplace for formal verification by miners.
- If `decidability_class == II`: The proposal requires a PASS verdict from Channel A to proceed.
- If `decidability_class == III`: The proposal is automatically escalated to `RequiresHumanReview`.

### 3.2.2. Continuous Friction Model

Governance friction is adjusted based on the `semantic_alignment_score`.

- **Quorum Multiplier:** `1.0 + (1.0 - semantic_alignment_score) * 0.5` (Ranges from 1.0x to 1.5x)
- **Timelock Multiplier:** `1.0 + (1.0 - semantic_alignment_score) * 2.0` (Ranges from 1.0x to 3.0x)

This creates a smooth curve where lower alignment scores progressively increase the difficulty of passing a proposal, rather than a binary switch.

---

## 4. Oracle Network: Protocol & Lifecycle

### 4.1. Oracle Set Selection & Rotation

1. **Eligibility:** Any network validator may become an oracle operator by staking an additional `ORACLE_BOND` (e.g., 100,000 CJN) in the oracle contract.
2. **Set Size:** The active oracle set is limited to the top 101 bonded operators by stake weight.
3. **Rotation:** The set is re-evaluated every `ORACLE_EPOCH` (e.g., 201,600 blocks, ~2 weeks). Operators who unbond must wait one epoch to exit.
4. **Sybil Resistance:** Oracle voting power is 1-operator-1-vote to prevent stake-based centralization of verdicts. Economic power resides in the underlying validator stake.

### 4.2. Oracle Liveness & Deadlines

5. **Oracle Report Window:** Oracles have `ORACLE_WINDOW` (e.g., 1,000 blocks) to submit their commit-reveal reports for a given proposal.
6. **Quorum Failure:** If the 2/3 participation quorum is not met within the window, the proposal automatically escalates to `RequiresHumanReview` with a high friction penalty.
7. **Reveal Failure:** If quorum is met for commits but not for reveals, non-revealing oracles are slashed `SLASH_NON_REVEAL` (15% of bond), and the reporting window is extended by 500 blocks for the remaining quorum.

### 4.3. Human Review: The Constitutional Jury

When a proposal is escalated to `RequiresHumanReview`:

8. **Jury Randomness Seed:** An unbiased seed for jury selection is generated using a Verifiable Random Function (VRF) keyed to the hash of the block in which the proposal was submitted. This prevents proposer/miner influence over the selection.
9. **Jury Selection:** Using the VRF-derived seed, a jury of 21 accounts is randomly selected from all token holders who have been active in the last 3 months, weighted by their `sqrt(stake)` to balance influence.
10. **Jury Duty:** Selected jurors must stake a small `JURY_BOND` and vote (YES/NO/ABSTAIN) on the proposal within 72 hours.
11. **Verdict:** A 2/3 supermajority of voting jurors is required to resolve the proposal. Failure to reach a verdict results in the proposal failing.
12. **Incentives:** Voting jurors are rewarded from the network treasury. Non-voting jurors forfeit their bond.

---

## 5. Slashing Policy (v5.0 Refined)

Slashing is reserved for provable misbehavior, not honest disagreement.

| Offense | Channel | Penalty | Justification |
|---------|---------|---------|---------------|
| Failure to Reveal | N/A | 15% of Bond | Disrupts liveness. Must be punished. |
| Provable Fraud | A | 100% of Bond + Ejection | Malicious, mathematically verifiable attack. |
| Heuristic Disagreement | B | 0% | Protects honest dissent and prevents oracle herding. |

---

## Appendix A: Channel A Determinism Specification

### A.1. Canonical Proposal Representation (v5.1 Patch)

To ensure both a stable identifier and a meaningful complexity score, we define two separate canonical forms derived from the same payload:

1. **AST Serialization:** The proposal's logic code is parsed into its Abstract Syntax Tree (AST). The AST is then serialized into a canonical JSON format with keys sorted alphabetically.
2. **Text Normalization:** The proposal's natural language text is converted to lowercase, with all punctuation removed and whitespace normalized to single spaces.
3. **Canonical Payload:** The core payload is defined as `CanonicalPayloadBytes = serialized_ast_json + "." + normalized_text`.
4. **Canonical Hash:** The official, unique identifier for the proposal is `CanonicalHash = sha256(CanonicalPayloadBytes)`. This hash is used for all on-chain references and commitments.

### A.2. Complexity Scoring Algorithm (v5.1 Patch)

1. **Input:** `CanonicalPayloadBytes` from A.1.
2. **Algorithm:** zlib compression (Level 9, default dictionary).
3. **Score:** `complexity_score = len(zlib(CanonicalPayloadBytes))`. The score is derived from compressing the full payload, not its hash.
4. **Test Vector:**
   - Input: A simple proposal to transfer 100 tokens.
   - Expected Score: ~75-150 (depending on exact text).

### A.3. Paradox Detection Rules

1. **Engine:** re2 regular expression matching on the normalized text.
2. **Patterns:**
   - `/(this proposal|the motion).*(passes|fails) iff.*(fails|passes)/`
   - `/(this rule|the following statement) is false/`
3. **Test Vector:**
   - Input: "This proposal passes iff it fails."
   - Expected Output: `paradox_found = true`.

### A.4. Cycle Detection

1. **Graph Extraction:** Parse the AST to build a directed graph where nodes are state variables and edges are dependencies (reads/writes).
2. **Algorithm:** Tarjan's strongly connected components algorithm.
3. **Output:** `cycle_found = true` if any component contains more than one node or a single node with a self-edge.

---

## Appendix B: Failure Modes & Mitigations

| Attack Scenario | Layer of Defense | Mitigation Mechanism |
|-----------------|------------------|---------------------|
| Gödelian Paradox Proposal | Channel A | Paradox Detection rejects the proposal before voting. |
| Malicious Oracle Collusion (Channel A) | Governance | On-chain fraud proof submitted by any honest node slashes all colluding oracles. |
| Oracle Herding (Channel B) | Slashing Policy | No slashing for disagreement protects honest dissent. |
