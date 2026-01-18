/**
 * Core types for AI Constitution DAO
 *
 * These TypeScript types mirror the Rust types in packages/core
 * and implement the v5.0 specification.
 */

/**
 * Decidability classification for proposals
 *
 * Determines how a proposal is routed through the governance pipeline:
 * - Class I: Routed to PoUW Marketplace for formal verification
 * - Class II: Requires Channel A PASS verdict to proceed
 * - Class III: Automatically escalated to Constitutional Jury
 */
export enum DecidabilityClass {
  /** Formally verifiable - route to PoUW miners */
  I = 'I',
  /** Requires deterministic Channel A check */
  II = 'II',
  /** Requires human judgment - escalate to jury */
  III = 'III',
}

/**
 * Channel A verification verdict (deterministic)
 *
 * Binary PASS/FAIL result that acts as a hard gate on proposals.
 * An incorrect verdict can be challenged via on-chain fraud proof.
 */
export interface ChannelAVerdict {
  /** Whether the proposal passed all Channel A checks */
  pass: boolean;
  /** Complexity score (zlib compressed size of canonical payload) */
  complexity_score: number;
  /** Whether a logical paradox was detected in the proposal text */
  paradox_found: boolean;
  /** Whether a dependency cycle was detected in the proposal logic */
  cycle_found: boolean;
}

/**
 * Channel B verification verdict (heuristic)
 *
 * Continuous scores from AI-driven risk assessment.
 * Acts as a soft gate, modifying governance friction.
 * Never slashable for disagreement.
 */
export interface ChannelBVerdict {
  /** Semantic alignment with L0 axioms (0.0 to 1.0) */
  semantic_alignment_score: number;
  /** Classification for governance routing */
  decidability_class: DecidabilityClass;
  /** Optional reasoning from the AI */
  reasoning?: string;
}

/**
 * Governance layer in the four-layer constitutional model
 *
 * Lower layers cannot modify higher layers (immutability gradient).
 */
export enum GovernanceLayer {
  /** L0: Immutable Core - Foundational axioms (off-chain verification) */
  L0Immutable = 'L0Immutable',
  /** L1: Constitutional Layer - High-level governance rules */
  L1Constitutional = 'L1Constitutional',
  /** L2: Operational Layer - Day-to-day DAO parameters */
  L2Operational = 'L2Operational',
  /** L3: Execution Layer - Smart contract implementations */
  L3Execution = 'L3Execution',
}

/**
 * Status of a proposal in its lifecycle
 */
export enum ProposalStatus {
  /** Initial state after submission */
  Pending = 'Pending',
  /** Awaiting Channel A deterministic verification */
  ChannelAReview = 'ChannelAReview',
  /** Awaiting Channel B heuristic assessment */
  ChannelBReview = 'ChannelBReview',
  /** Active voting period */
  Voting = 'Voting',
  /** Escalated to Constitutional Jury */
  RequiresHumanReview = 'RequiresHumanReview',
  /** Proposal passed all checks and voting */
  Passed = 'Passed',
  /** Proposal rejected at some stage */
  Rejected = 'Rejected',
  /** Proposal has been executed on-chain */
  Executed = 'Executed',
}

/**
 * A governance proposal
 */
export interface Proposal {
  /** Unique identifier (sha256 of canonical payload, hex encoded) */
  id: string;
  /** XRPL address of the proposer */
  proposer: string;
  /** Canonical AST JSON of the proposal logic */
  logic_ast: string;
  /** Natural language description of the proposal */
  text: string;
  /** Target governance layer */
  layer: GovernanceLayer;
  /** Unix timestamp of creation */
  created_at: number;
  /** Current status in the lifecycle */
  status: ProposalStatus;
}

/**
 * Input for creating a new proposal
 */
export interface ProposalInput {
  /** Canonical AST JSON of the proposal logic */
  logic_ast: string;
  /** Natural language description of the proposal */
  text: string;
  /** Target governance layer */
  layer: GovernanceLayer;
}

/**
 * Friction parameters calculated from Channel B alignment score
 */
export interface FrictionParams {
  /** Required quorum (base * multiplier) */
  required_quorum: number;
  /** Timelock duration in seconds (base * multiplier) */
  timelock_duration: number;
  /** The alignment score used to calculate friction */
  alignment_score: number;
  /** Quorum multiplier (1.0 to 1.5) */
  quorum_multiplier: number;
  /** Timelock multiplier (1.0 to 3.0) */
  timelock_multiplier: number;
}

/**
 * Vote options for proposals
 */
export enum Vote {
  Yes = 'Yes',
  No = 'No',
  Abstain = 'Abstain',
}

/**
 * Oracle operator information
 */
export interface OracleOperator {
  /** XRPL address of the operator */
  address: string;
  /** Bond amount in drops (1 XRP = 1,000,000 drops) */
  bond_amount: string;
  /** XRPL escrow sequence number */
  escrow_sequence: number;
  /** Unix timestamp of registration */
  registered_at: number;
  /** Whether the operator is in the active set */
  active: boolean;
  /** Pending unbond timestamp (if any) */
  unbonding_at?: number;
}

/**
 * Fraud proof for Channel A misbehavior
 */
export interface FraudProof {
  /** The proposal being challenged */
  proposal_id: string;
  /** The verdict that was submitted by the oracle */
  claimed_verdict: ChannelAVerdict;
  /** The correct verdict (recomputed) */
  actual_verdict: ChannelAVerdict;
  /** Witness data for verification */
  witness: FraudProofWitness;
}

/**
 * Witness data for fraud proofs
 */
export interface FraudProofWitness {
  /** The canonical payload bytes (hex encoded) */
  canonical_payload: string;
  /** Computation trace for debugging */
  computation_trace: string[];
}

/**
 * Configuration constants
 */
export const CONFIG = {
  /** Maximum allowed complexity score (from spec) */
  MAX_COMPLEXITY: 10_000,

  /** Oracle bond amount (100,000 XRP in drops) */
  ORACLE_BOND: '100000000000',

  /** Oracle epoch duration in ledgers (~2 weeks) */
  ORACLE_EPOCH: 201_600,

  /** Oracle report window in ledgers */
  ORACLE_WINDOW: 1_000,

  /** Slash percentage for non-reveal (15%) */
  SLASH_NON_REVEAL: 0.15,

  /** Jury size */
  JURY_SIZE: 21,

  /** Jury voting period (72 hours in seconds) */
  JURY_VOTING_PERIOD: 72 * 60 * 60,

  /** Active oracle set size */
  ACTIVE_ORACLE_SET_SIZE: 101,

  /** Required participation quorum for oracles (2/3) */
  ORACLE_QUORUM: 2 / 3,

  /** Required supermajority for jury (2/3) */
  JURY_SUPERMAJORITY: 2 / 3,

  /** Base quorum (10% of voting power) */
  BASE_QUORUM: 0.1,

  /** Base timelock (24 hours in seconds) */
  BASE_TIMELOCK: 86400,
} as const;

/**
 * Calculate friction parameters from alignment score
 *
 * From spec v5.0:
 * - Quorum Multiplier: 1.0 + (1.0 - alignment_score) * 0.5
 * - Timelock Multiplier: 1.0 + (1.0 - alignment_score) * 2.0
 */
export function calculateFriction(alignmentScore: number): FrictionParams {
  const score = Math.max(0, Math.min(1, alignmentScore));
  const quorumMultiplier = 1.0 + (1.0 - score) * 0.5;
  const timelockMultiplier = 1.0 + (1.0 - score) * 2.0;

  return {
    required_quorum: CONFIG.BASE_QUORUM * quorumMultiplier,
    timelock_duration: Math.floor(CONFIG.BASE_TIMELOCK * timelockMultiplier),
    alignment_score: score,
    quorum_multiplier: quorumMultiplier,
    timelock_multiplier: timelockMultiplier,
  };
}
