/**
 * Commit-Reveal Protocol for Oracle Consensus
 *
 * Implements the two-phase commit-reveal protocol from spec v5.0:
 * 1. Commit Phase: Oracles submit hash(verdict + nonce)
 * 2. Reveal Phase: Oracles reveal verdict and nonce
 *
 * This prevents oracles from copying each other's verdicts.
 */

import { createHash, randomBytes } from 'crypto';
import { XRPLClient, TransactionResult } from '../xrpl/client';
import { MEMO_TYPES } from '../xrpl/transactions';
import {
  ChannelAVerdict,
  ChannelBVerdict,
  CONFIG,
} from '../types';

/**
 * Combined verdict from both channels
 */
export interface OracleVerdict {
  channel_a: ChannelAVerdict;
  channel_b: ChannelBVerdict;
  timestamp: number;
}

/**
 * Commitment data structure
 */
export interface Commitment {
  /** Proposal ID being voted on */
  proposal_id: string;
  /** Hash of verdict + nonce */
  commitment_hash: string;
  /** Oracle address */
  oracle_address: string;
  /** Ledger index when committed */
  ledger_index: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Reveal data structure
 */
export interface Reveal {
  /** Proposal ID */
  proposal_id: string;
  /** The actual verdict */
  verdict: OracleVerdict;
  /** Nonce used in commitment */
  nonce: string;
  /** Oracle address */
  oracle_address: string;
  /** Ledger index when revealed */
  ledger_index: number;
}

/**
 * Aggregated verdict result
 */
export interface AggregatedVerdict {
  /** Proposal ID */
  proposal_id: string;
  /** Number of participating oracles */
  participation_count: number;
  /** Total oracles in active set */
  total_oracles: number;
  /** Whether quorum was reached */
  quorum_reached: boolean;
  /** Channel A consensus (majority vote) */
  channel_a_consensus: ChannelAVerdict | null;
  /** Channel B consensus (average scores) */
  channel_b_consensus: ChannelBVerdict | null;
  /** Individual reveals for audit */
  reveals: Reveal[];
  /** Oracles who committed but didn't reveal */
  non_revealers: string[];
}

/**
 * Commit-Reveal Protocol State
 */
export enum ProtocolPhase {
  /** Waiting for proposal */
  Idle = 'Idle',
  /** Accepting commitments */
  CommitPhase = 'CommitPhase',
  /** Accepting reveals */
  RevealPhase = 'RevealPhase',
  /** Tallying results */
  Tallying = 'Tallying',
  /** Complete */
  Complete = 'Complete',
}

/**
 * Protocol state for a proposal
 */
export interface ProposalProtocolState {
  proposal_id: string;
  phase: ProtocolPhase;
  commit_deadline: number;
  reveal_deadline: number;
  commitments: Map<string, Commitment>;
  reveals: Map<string, Reveal>;
  result: AggregatedVerdict | null;
}

/**
 * Commit-Reveal Protocol Manager
 */
export class CommitRevealProtocol {
  private client: XRPLClient;
  private daoAddress: string;
  private states: Map<string, ProposalProtocolState> = new Map();
  private pendingNonces: Map<string, string> = new Map(); // proposalId -> nonce

  constructor(client: XRPLClient, daoAddress: string) {
    this.client = client;
    this.daoAddress = daoAddress;
  }

  /**
   * Initialize protocol for a new proposal
   */
  initializeProposal(
    proposalId: string,
    commitWindowLedgers: number = CONFIG.ORACLE_WINDOW,
    revealWindowLedgers: number = CONFIG.ORACLE_WINDOW
  ): ProposalProtocolState {
    const now = Date.now();
    const ledgerTimeMs = 4000; // ~4 seconds per ledger

    const state: ProposalProtocolState = {
      proposal_id: proposalId,
      phase: ProtocolPhase.CommitPhase,
      commit_deadline: now + commitWindowLedgers * ledgerTimeMs,
      reveal_deadline: now + (commitWindowLedgers + revealWindowLedgers) * ledgerTimeMs,
      commitments: new Map(),
      reveals: new Map(),
      result: null,
    };

    this.states.set(proposalId, state);
    return state;
  }

  /**
   * Create a commitment for a verdict
   *
   * @returns The nonce (must be saved for reveal phase)
   */
  createCommitment(proposalId: string, verdict: OracleVerdict): {
    commitment_hash: string;
    nonce: string;
  } {
    // Generate random nonce
    const nonce = randomBytes(32).toString('hex');

    // Create commitment hash: sha256(verdict_json + nonce)
    const verdictJson = JSON.stringify(verdict);
    const commitment_hash = createHash('sha256')
      .update(verdictJson + nonce)
      .digest('hex');

    // Store nonce for later reveal
    this.pendingNonces.set(proposalId, nonce);

    return { commitment_hash, nonce };
  }

  /**
   * Verify a commitment matches a revealed verdict
   */
  verifyCommitment(
    commitment_hash: string,
    verdict: OracleVerdict,
    nonce: string
  ): boolean {
    const verdictJson = JSON.stringify(verdict);
    const computed_hash = createHash('sha256')
      .update(verdictJson + nonce)
      .digest('hex');

    return computed_hash === commitment_hash;
  }

  /**
   * Submit commitment to XRPL
   */
  async submitCommitment(
    proposalId: string,
    verdict: OracleVerdict
  ): Promise<{ tx: TransactionResult; nonce: string }> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    const state = this.states.get(proposalId);
    if (!state) {
      throw new Error(`No protocol state for proposal ${proposalId}`);
    }

    if (state.phase !== ProtocolPhase.CommitPhase) {
      throw new Error(`Not in commit phase. Current phase: ${state.phase}`);
    }

    if (Date.now() > state.commit_deadline) {
      throw new Error('Commit deadline has passed');
    }

    // Create commitment
    const { commitment_hash, nonce } = this.createCommitment(proposalId, verdict);

    // Submit to XRPL
    const commitmentData = {
      proposal_id: proposalId,
      commitment_hash,
      timestamp: Date.now(),
    };

    const tx = await this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.ORACLE_COMMIT,
      commitmentData
    );

    // Record commitment locally
    const commitment: Commitment = {
      proposal_id: proposalId,
      commitment_hash,
      oracle_address: wallet.address,
      ledger_index: tx.ledger_index,
      timestamp: Date.now(),
    };
    state.commitments.set(wallet.address, commitment);

    return { tx, nonce };
  }

  /**
   * Submit reveal to XRPL
   */
  async submitReveal(
    proposalId: string,
    verdict: OracleVerdict,
    nonce?: string
  ): Promise<TransactionResult> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    const state = this.states.get(proposalId);
    if (!state) {
      throw new Error(`No protocol state for proposal ${proposalId}`);
    }

    // Use stored nonce if not provided
    const actualNonce = nonce || this.pendingNonces.get(proposalId);
    if (!actualNonce) {
      throw new Error('No nonce available for reveal');
    }

    // Verify we have a commitment
    const commitment = state.commitments.get(wallet.address);
    if (!commitment) {
      throw new Error('No commitment found for this oracle');
    }

    // Verify the reveal matches the commitment
    if (!this.verifyCommitment(commitment.commitment_hash, verdict, actualNonce)) {
      throw new Error('Reveal does not match commitment');
    }

    // Submit reveal
    const revealData = {
      proposal_id: proposalId,
      verdict,
      nonce: actualNonce,
      timestamp: Date.now(),
    };

    const tx = await this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.ORACLE_REVEAL,
      revealData
    );

    // Record reveal locally
    const reveal: Reveal = {
      proposal_id: proposalId,
      verdict,
      nonce: actualNonce,
      oracle_address: wallet.address,
      ledger_index: tx.ledger_index,
    };
    state.reveals.set(wallet.address, reveal);

    // Clear pending nonce
    this.pendingNonces.delete(proposalId);

    return tx;
  }

  /**
   * Process a received commitment
   */
  processCommitment(commitment: Commitment): void {
    const state = this.states.get(commitment.proposal_id);
    if (!state) {
      console.warn(`No state for proposal ${commitment.proposal_id}`);
      return;
    }

    state.commitments.set(commitment.oracle_address, commitment);
  }

  /**
   * Process a received reveal
   */
  processReveal(reveal: Reveal): boolean {
    const state = this.states.get(reveal.proposal_id);
    if (!state) {
      console.warn(`No state for proposal ${reveal.proposal_id}`);
      return false;
    }

    // Verify commitment exists
    const commitment = state.commitments.get(reveal.oracle_address);
    if (!commitment) {
      console.warn(`No commitment from oracle ${reveal.oracle_address}`);
      return false;
    }

    // Verify reveal matches commitment
    if (!this.verifyCommitment(commitment.commitment_hash, reveal.verdict, reveal.nonce)) {
      console.warn(`Invalid reveal from oracle ${reveal.oracle_address}`);
      return false;
    }

    state.reveals.set(reveal.oracle_address, reveal);
    return true;
  }

  /**
   * Transition to reveal phase
   */
  transitionToRevealPhase(proposalId: string): void {
    const state = this.states.get(proposalId);
    if (state) {
      state.phase = ProtocolPhase.RevealPhase;
    }
  }

  /**
   * Tally the results
   */
  tally(proposalId: string, totalOracles: number): AggregatedVerdict {
    const state = this.states.get(proposalId);
    if (!state) {
      throw new Error(`No state for proposal ${proposalId}`);
    }

    state.phase = ProtocolPhase.Tallying;

    const reveals = Array.from(state.reveals.values());
    const commitAddresses = new Set(state.commitments.keys());
    const revealAddresses = new Set(state.reveals.keys());

    // Find non-revealers (committed but didn't reveal)
    const nonRevealers = Array.from(commitAddresses)
      .filter(addr => !revealAddresses.has(addr));

    // Check quorum
    const quorumThreshold = Math.ceil(totalOracles * CONFIG.ORACLE_QUORUM);
    const quorumReached = reveals.length >= quorumThreshold;

    let channelAConsensus: ChannelAVerdict | null = null;
    let channelBConsensus: ChannelBVerdict | null = null;

    if (quorumReached && reveals.length > 0) {
      // Channel A: Majority vote on pass/fail
      const passVotes = reveals.filter(r => r.verdict.channel_a.pass).length;
      const failVotes = reveals.length - passVotes;

      if (passVotes > failVotes) {
        // Use the first passing verdict as representative
        const passingReveal = reveals.find(r => r.verdict.channel_a.pass);
        channelAConsensus = passingReveal?.verdict.channel_a || null;
      } else {
        const failingReveal = reveals.find(r => !r.verdict.channel_a.pass);
        channelAConsensus = failingReveal?.verdict.channel_a || null;
      }

      // Channel B: Average alignment scores, majority decidability class
      const avgAlignment = reveals.reduce(
        (sum, r) => sum + r.verdict.channel_b.semantic_alignment_score,
        0
      ) / reveals.length;

      // Count decidability classes
      const classCounts = { I: 0, II: 0, III: 0 };
      reveals.forEach(r => {
        classCounts[r.verdict.channel_b.decidability_class]++;
      });

      const majorityClass = Object.entries(classCounts)
        .sort((a, b) => b[1] - a[1])[0][0] as 'I' | 'II' | 'III';

      channelBConsensus = {
        semantic_alignment_score: avgAlignment,
        decidability_class: majorityClass as any,
      };
    }

    const result: AggregatedVerdict = {
      proposal_id: proposalId,
      participation_count: reveals.length,
      total_oracles: totalOracles,
      quorum_reached: quorumReached,
      channel_a_consensus: channelAConsensus,
      channel_b_consensus: channelBConsensus,
      reveals,
      non_revealers: nonRevealers,
    };

    state.result = result;
    state.phase = ProtocolPhase.Complete;

    return result;
  }

  /**
   * Get protocol state for a proposal
   */
  getState(proposalId: string): ProposalProtocolState | undefined {
    return this.states.get(proposalId);
  }

  /**
   * Check if we should transition phases based on time
   */
  checkPhaseTransitions(proposalId: string): void {
    const state = this.states.get(proposalId);
    if (!state) return;

    const now = Date.now();

    if (state.phase === ProtocolPhase.CommitPhase && now > state.commit_deadline) {
      state.phase = ProtocolPhase.RevealPhase;
    }

    if (state.phase === ProtocolPhase.RevealPhase && now > state.reveal_deadline) {
      state.phase = ProtocolPhase.Tallying;
    }
  }

  /**
   * Calculate commitment hash (static utility)
   */
  static hashCommitment(verdict: OracleVerdict, nonce: string): string {
    const verdictJson = JSON.stringify(verdict);
    return createHash('sha256')
      .update(verdictJson + nonce)
      .digest('hex');
  }
}
