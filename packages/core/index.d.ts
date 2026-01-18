/**
 * AI Constitution DAO Core - Native NAPI Bindings
 *
 * TypeScript type definitions for the native Rust Channel A verification module.
 *
 * @packageDocumentation
 */

/**
 * Channel A verification verdict
 *
 * Binary PASS/FAIL result that acts as a hard gate on proposals.
 * An incorrect verdict can be challenged via on-chain fraud proof.
 */
export interface ChannelAVerdict {
  /** Whether the proposal passed all Channel A checks */
  pass: boolean;
  /** Complexity score (zlib compressed size of canonical payload) */
  complexityScore: number;
  /** Whether a logical paradox was detected */
  paradoxFound: boolean;
  /** Whether a dependency cycle was detected */
  cycleFound: boolean;
}

/**
 * Canonical payload result from canonicalization
 */
export interface CanonicalResult {
  /** Canonical payload as hex-encoded string */
  payloadHex: string;
  /** SHA-256 hash as hex-encoded string (proposal ID) */
  hash: string;
  /** Payload length in bytes */
  length: number;
}

/**
 * Friction parameters calculated from Channel B alignment score
 */
export interface FrictionParams {
  /** Required quorum (base * multiplier) */
  requiredQuorum: number;
  /** Timelock duration in seconds */
  timelockDuration: number;
  /** The alignment score used */
  alignmentScore: number;
  /** Quorum multiplier (1.0 to 1.5) */
  quorumMultiplier: number;
  /** Timelock multiplier (1.0 to 3.0) */
  timelockMultiplier: number;
}

/**
 * Governance layer enum
 */
export type GovernanceLayer =
  | 'L0Immutable'
  | 'L1Constitutional'
  | 'L2Operational'
  | 'L3Execution';

/**
 * Verify a proposal through the full Channel A pipeline
 *
 * This is the main entry point for Channel A verification.
 *
 * @param proposer - XRPL address of the proposer
 * @param logicAst - JSON AST of the proposal logic
 * @param text - Natural language description
 * @param layer - Governance layer
 * @returns Channel A verdict with pass/fail and details
 *
 * @example
 * ```typescript
 * const verdict = verifyProposal(
 *   'rProposerAddress',
 *   '{"action": "transfer", "amount": 100}',
 *   'Transfer 100 tokens to the community fund',
 *   'L2Operational'
 * );
 *
 * if (verdict.pass) {
 *   console.log('Proposal passed Channel A verification');
 * } else {
 *   console.log('Proposal failed:', {
 *     paradox: verdict.paradoxFound,
 *     cycle: verdict.cycleFound,
 *     complexity: verdict.complexityScore
 *   });
 * }
 * ```
 */
export function verifyProposal(
  proposer: string,
  logicAst: string,
  text: string,
  layer: GovernanceLayer
): ChannelAVerdict;

/**
 * Verify a proposal from JSON input
 *
 * @param proposalJson - JSON string containing proposal data
 * @returns Channel A verdict
 *
 * @example
 * ```typescript
 * const proposal = {
 *   proposer: 'rProposerAddress',
 *   logic_ast: '{"action": "test"}',
 *   text: 'Test proposal',
 *   layer: 'L2Operational'
 * };
 *
 * const verdict = verifyProposalJson(JSON.stringify(proposal));
 * ```
 */
export function verifyProposalJson(proposalJson: string): ChannelAVerdict;

/**
 * Canonicalize a proposal and return the canonical payload
 *
 * @param proposer - XRPL address
 * @param logicAst - JSON AST
 * @param text - Natural language description
 * @param layer - Governance layer
 * @returns Canonical result with payload hash and hex encoding
 *
 * @example
 * ```typescript
 * const canonical = canonicalizeProposal(
 *   'rProposerAddress',
 *   '{"action": "test"}',
 *   'Test proposal',
 *   'L2Operational'
 * );
 *
 * console.log('Proposal ID:', canonical.hash);
 * console.log('Payload length:', canonical.length);
 * ```
 */
export function canonicalizeProposal(
  proposer: string,
  logicAst: string,
  text: string,
  layer: GovernanceLayer
): CanonicalResult;

/**
 * Compute complexity score for a payload
 *
 * Uses zlib compression level 9 to measure Kolmogorov complexity proxy.
 *
 * @param payloadHex - Hex-encoded payload bytes
 * @returns Complexity score (compressed size in bytes)
 *
 * @example
 * ```typescript
 * const canonical = canonicalizeProposal(...);
 * const complexity = computeComplexityScore(canonical.payloadHex);
 *
 * if (complexity > getMaxComplexity()) {
 *   console.log('Proposal too complex');
 * }
 * ```
 */
export function computeComplexityScore(payloadHex: string): number;

/**
 * Detect paradoxes in proposal text
 *
 * Uses regex patterns to detect self-referential paradoxes like:
 * - "This proposal passes iff it fails"
 * - "This statement is false"
 *
 * @param text - Natural language proposal text
 * @returns true if a paradox is detected
 *
 * @example
 * ```typescript
 * if (detectParadoxInText('This proposal passes iff it fails')) {
 *   console.log('Paradox detected!');
 * }
 * ```
 */
export function detectParadoxInText(text: string): boolean;

/**
 * Detect cycles in proposal logic AST
 *
 * Uses Tarjan's strongly connected components algorithm.
 *
 * @param logicAst - JSON AST of proposal logic
 * @returns true if a cycle is detected
 *
 * @example
 * ```typescript
 * const ast = '{"deps": [{"self": true}]}';
 * if (detectCyclesInAst(ast)) {
 *   console.log('Cycle detected in dependencies');
 * }
 * ```
 */
export function detectCyclesInAst(logicAst: string): boolean;

/**
 * Calculate friction parameters from alignment score
 *
 * From spec v5.0:
 * - Quorum Multiplier: 1.0 + (1.0 - alignment_score) * 0.5
 * - Timelock Multiplier: 1.0 + (1.0 - alignment_score) * 2.0
 *
 * @param alignmentScore - Semantic alignment score from Channel B (0.0 to 1.0)
 * @returns Friction parameters
 *
 * @example
 * ```typescript
 * const params = calculateFriction(0.8);
 * console.log('Quorum:', params.requiredQuorum);
 * console.log('Timelock:', params.timelockDuration, 'seconds');
 * ```
 */
export function calculateFriction(alignmentScore: number): FrictionParams;

/**
 * Get the maximum allowed complexity score
 *
 * @returns MAX_COMPLEXITY constant (10,000)
 */
export function getMaxComplexity(): number;

/**
 * Get the oracle bond amount in drops
 *
 * @returns ORACLE_BOND constant as string (100,000 XRP = 100000000000 drops)
 */
export function getOracleBond(): string;

/**
 * Get the active oracle set size
 *
 * @returns ACTIVE_ORACLE_SET_SIZE constant (101)
 */
export function getActiveOracleSetSize(): number;

/**
 * Get the jury size
 *
 * @returns JURY_SIZE constant (21)
 */
export function getJurySize(): number;

/**
 * Get the jury voting period in seconds
 *
 * @returns JURY_VOTING_PERIOD constant (72 hours = 259200 seconds)
 */
export function getJuryVotingPeriod(): number;
