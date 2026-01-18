/**
 * Proposal Manager
 *
 * Manages the full lifecycle of governance proposals:
 * 1. Submission -> Pending
 * 2. Oracle Review (Channel A + B)
 * 3. Routing based on decidability class
 * 4. Voting or Human Review
 * 5. Execution or Rejection
 */

import { createHash } from 'crypto';
import { XRPLClient } from '../xrpl/client';
import { MEMO_TYPES } from '../xrpl/transactions';
import {
  Proposal,
  ProposalInput,
  ProposalStatus,
  GovernanceLayer,
  ChannelAVerdict,
  ChannelBVerdict,
  DecidabilityClass,
  FrictionParams,
  calculateFriction,
} from '../types';
import {
  CommitRevealProtocol,
  AggregatedVerdict,
} from '../network/consensus';
import { OracleRegistry } from '../network/registry';

/**
 * Proposal with full state
 */
export interface ProposalState extends Proposal {
  /** Channel A verdict (if available) */
  channel_a_verdict: ChannelAVerdict | null;
  /** Channel B verdict (if available) */
  channel_b_verdict: ChannelBVerdict | null;
  /** Calculated friction parameters */
  friction: FrictionParams | null;
  /** Rejection reason (if rejected) */
  rejection_reason: string | null;
  /** Voting results (if voted) */
  voting_results: VotingResults | null;
  /** Jury verdict (if escalated) */
  jury_verdict: JuryVerdict | null;
}

/**
 * Voting results
 */
export interface VotingResults {
  yes_votes: number;
  no_votes: number;
  abstain_votes: number;
  total_voting_power: number;
  quorum_reached: boolean;
  passed: boolean;
}

/**
 * Jury verdict
 */
export interface JuryVerdict {
  jurors: string[];
  votes: Map<string, 'YES' | 'NO' | 'ABSTAIN'>;
  supermajority_reached: boolean;
  verdict: 'APPROVED' | 'REJECTED' | 'NO_VERDICT';
}

/**
 * Proposal Manager
 */
export class ProposalManager {
  private client: XRPLClient;
  private daoAddress: string;
  private proposals: Map<string, ProposalState> = new Map();
  private commitReveal: CommitRevealProtocol;
  private registry: OracleRegistry;

  constructor(
    client: XRPLClient,
    daoAddress: string,
    registry: OracleRegistry
  ) {
    this.client = client;
    this.daoAddress = daoAddress;
    this.registry = registry;
    this.commitReveal = new CommitRevealProtocol(client, daoAddress);
  }

  /**
   * Submit a new proposal
   */
  async submit(input: ProposalInput): Promise<ProposalState> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    // Compute canonical hash (proposal ID)
    const canonicalPayload = this.canonicalize(input);
    const id = createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    // Check for duplicate
    if (this.proposals.has(id)) {
      throw new Error('Proposal already exists');
    }

    // Create proposal
    const proposal: ProposalState = {
      id,
      proposer: wallet.address,
      logic_ast: input.logic_ast,
      text: input.text,
      layer: input.layer,
      created_at: Date.now(),
      status: ProposalStatus.Pending,
      channel_a_verdict: null,
      channel_b_verdict: null,
      friction: null,
      rejection_reason: null,
      voting_results: null,
      jury_verdict: null,
    };

    // Submit to XRPL
    const proposalData = {
      id,
      logic_ast: input.logic_ast,
      text: input.text,
      layer: input.layer,
    };

    await this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.PROPOSAL,
      proposalData
    );

    // Store proposal
    this.proposals.set(id, proposal);

    // Initialize commit-reveal protocol
    this.commitReveal.initializeProposal(id);

    // Transition to Channel A review
    proposal.status = ProposalStatus.ChannelAReview;

    return proposal;
  }

  /**
   * Canonicalize proposal for hashing
   */
  private canonicalize(input: ProposalInput): string {
    // Sort AST keys
    const ast = JSON.parse(input.logic_ast);
    const sortedAst = this.sortJsonKeys(ast);
    const astString = JSON.stringify(sortedAst);

    // Normalize text
    const normalizedText = input.text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return astString + '.' + normalizedText;
  }

  /**
   * Recursively sort JSON keys
   */
  private sortJsonKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortJsonKeys(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = this.sortJsonKeys(obj[key]);
    }
    return sorted;
  }

  /**
   * Process oracle verdicts for a proposal
   */
  processOracleVerdicts(
    proposalId: string,
    aggregatedVerdict: AggregatedVerdict
  ): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (!aggregatedVerdict.quorum_reached) {
      // Quorum failure -> escalate to human review with penalty
      proposal.status = ProposalStatus.RequiresHumanReview;
      proposal.friction = calculateFriction(0); // Maximum friction
      return;
    }

    // Store verdicts
    proposal.channel_a_verdict = aggregatedVerdict.channel_a_consensus;
    proposal.channel_b_verdict = aggregatedVerdict.channel_b_consensus;

    // Check Channel A hard gate
    if (!aggregatedVerdict.channel_a_consensus?.pass) {
      proposal.status = ProposalStatus.Rejected;
      proposal.rejection_reason = 'Failed Channel A verification';
      return;
    }

    // Calculate friction from Channel B
    if (aggregatedVerdict.channel_b_consensus) {
      proposal.friction = calculateFriction(
        aggregatedVerdict.channel_b_consensus.semantic_alignment_score
      );
    }

    // Route based on decidability class
    this.routeProposal(proposal);
  }

  /**
   * Route proposal based on decidability class
   */
  private routeProposal(proposal: ProposalState): void {
    const decidabilityClass = proposal.channel_b_verdict?.decidability_class;

    switch (decidabilityClass) {
      case DecidabilityClass.I:
        // Route to PoUW marketplace (future: COINjecture)
        // For now, treat as standard voting
        proposal.status = ProposalStatus.Voting;
        break;

      case DecidabilityClass.II:
        // Standard voting with Channel A gate (already passed)
        proposal.status = ProposalStatus.Voting;
        break;

      case DecidabilityClass.III:
        // Escalate to human review
        proposal.status = ProposalStatus.RequiresHumanReview;
        break;

      default:
        // Default to voting
        proposal.status = ProposalStatus.Voting;
    }
  }

  /**
   * Record a vote on a proposal
   */
  recordVote(
    proposalId: string,
    voter: string,
    vote: 'YES' | 'NO' | 'ABSTAIN',
    votingPower: number
  ): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.Voting) {
      throw new Error('Proposal not in voting phase');
    }

    // Initialize voting results if needed
    if (!proposal.voting_results) {
      proposal.voting_results = {
        yes_votes: 0,
        no_votes: 0,
        abstain_votes: 0,
        total_voting_power: 0,
        quorum_reached: false,
        passed: false,
      };
    }

    // Record vote
    switch (vote) {
      case 'YES':
        proposal.voting_results.yes_votes += votingPower;
        break;
      case 'NO':
        proposal.voting_results.no_votes += votingPower;
        break;
      case 'ABSTAIN':
        proposal.voting_results.abstain_votes += votingPower;
        break;
    }

    proposal.voting_results.total_voting_power += votingPower;
  }

  /**
   * Finalize voting on a proposal
   */
  finalizeVoting(proposalId: string, totalVotingPower: number): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || !proposal.voting_results) {
      throw new Error('Proposal not found or no votes recorded');
    }

    const results = proposal.voting_results;
    const friction = proposal.friction || calculateFriction(0.5);

    // Check quorum
    const participation = results.total_voting_power / totalVotingPower;
    results.quorum_reached = participation >= friction.required_quorum;

    if (!results.quorum_reached) {
      proposal.status = ProposalStatus.Rejected;
      proposal.rejection_reason = 'Quorum not reached';
      return;
    }

    // Simple majority of non-abstaining votes
    const votingVotes = results.yes_votes + results.no_votes;
    results.passed = results.yes_votes > results.no_votes;

    proposal.status = results.passed
      ? ProposalStatus.Passed
      : ProposalStatus.Rejected;

    if (!results.passed) {
      proposal.rejection_reason = 'Majority voted against';
    }
  }

  /**
   * Record jury verdict
   */
  recordJuryVerdict(proposalId: string, verdict: JuryVerdict): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.RequiresHumanReview) {
      throw new Error('Proposal not in human review phase');
    }

    proposal.jury_verdict = verdict;

    switch (verdict.verdict) {
      case 'APPROVED':
        proposal.status = ProposalStatus.Passed;
        break;
      case 'REJECTED':
        proposal.status = ProposalStatus.Rejected;
        proposal.rejection_reason = 'Rejected by constitutional jury';
        break;
      case 'NO_VERDICT':
        proposal.status = ProposalStatus.Rejected;
        proposal.rejection_reason = 'Jury failed to reach verdict';
        break;
    }
  }

  /**
   * Mark proposal as executed
   */
  markExecuted(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.Passed) {
      throw new Error('Proposal has not passed');
    }

    proposal.status = ProposalStatus.Executed;
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): ProposalState | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Get all proposals
   */
  getAllProposals(): ProposalState[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Get proposals by status
   */
  getProposalsByStatus(status: ProposalStatus): ProposalState[] {
    return Array.from(this.proposals.values())
      .filter(p => p.status === status);
  }

  /**
   * Get the commit-reveal protocol instance
   */
  getCommitRevealProtocol(): CommitRevealProtocol {
    return this.commitReveal;
  }

  /**
   * Check if proposal is in voting window
   */
  isInVotingWindow(proposalId: string): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== ProposalStatus.Voting) {
      return false;
    }

    const friction = proposal.friction || calculateFriction(0.5);
    const votingDeadline = proposal.created_at + friction.timelock_duration * 1000;

    return Date.now() < votingDeadline;
  }

  /**
   * Export state for persistence
   */
  exportState(): ProposalState[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Import state from persistence
   */
  importState(proposals: ProposalState[]): void {
    this.proposals.clear();
    for (const proposal of proposals) {
      this.proposals.set(proposal.id, proposal);
    }
  }
}
