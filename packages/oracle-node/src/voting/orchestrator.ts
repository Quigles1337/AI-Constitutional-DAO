/**
 * Governance Orchestrator
 *
 * High-level coordinator for the complete governance flow:
 * 1. Proposal submission
 * 2. Oracle review (Channel A + B)
 * 3. Routing decision
 * 4. Voting/Jury/PoUW execution
 * 5. Timelock enforcement
 * 6. Execution
 *
 * Emits events for external monitoring and UI updates.
 */

import { EventEmitter } from 'events';
import { XRPLClient } from '../xrpl/client';
import { ProposalManager, ProposalState, VotingResults } from '../governance/proposal';
import { ConstitutionalJury, JurySelection } from '../governance/jury';
import { OracleRegistry } from '../network/registry';
import { CommitRevealProtocol, AggregatedVerdict } from '../network/consensus';
import { VotingSystem, VotingTally } from './votingSystem';
import { DecidabilityRouter, RoutingDecision, Route } from './router';
import {
  ProposalInput,
  ProposalStatus,
  FrictionParams,
  calculateFriction,
  Vote,
} from '../types';

/**
 * Governance events
 */
export enum GovernanceEvent {
  ProposalSubmitted = 'proposal:submitted',
  OracleReviewStarted = 'oracle:review_started',
  OracleReviewComplete = 'oracle:review_complete',
  RoutingDecided = 'routing:decided',
  VotingOpened = 'voting:opened',
  VoteCast = 'voting:vote_cast',
  VotingClosed = 'voting:closed',
  JurySelected = 'jury:selected',
  JuryVerdictReached = 'jury:verdict_reached',
  ProposalPassed = 'proposal:passed',
  ProposalRejected = 'proposal:rejected',
  TimelockStarted = 'timelock:started',
  TimelockExpired = 'timelock:expired',
  ProposalExecuted = 'proposal:executed',
}

/**
 * Proposal in governance pipeline
 */
export interface GovernanceProposal {
  /** The proposal state */
  proposal: ProposalState;
  /** Current phase in the pipeline */
  phase: GovernancePhase;
  /** Routing decision */
  routing?: RoutingDecision;
  /** Voting tally (if in voting) */
  votingTally?: VotingTally;
  /** Jury selection (if in jury review) */
  jurySelection?: JurySelection;
  /** Timelock expiry (if passed and waiting) */
  timelockExpiry?: number;
  /** Execution transaction hash */
  executionTx?: string;
}

/**
 * Governance phases
 */
export enum GovernancePhase {
  Submitted = 'Submitted',
  OracleReview = 'OracleReview',
  Routing = 'Routing',
  Voting = 'Voting',
  JuryReview = 'JuryReview',
  PoUWVerification = 'PoUWVerification',
  Timelock = 'Timelock',
  ReadyToExecute = 'ReadyToExecute',
  Executed = 'Executed',
  Rejected = 'Rejected',
}

/**
 * Governance Orchestrator
 */
export class GovernanceOrchestrator extends EventEmitter {
  private client: XRPLClient;
  private daoAddress: string;
  private proposalManager: ProposalManager;
  private votingSystem: VotingSystem;
  private router: DecidabilityRouter;
  private jury: ConstitutionalJury;
  private registry: OracleRegistry;
  private commitReveal: CommitRevealProtocol;

  private pipeline: Map<string, GovernanceProposal> = new Map();
  private totalVotingSupply: string = '1000000000000'; // Default 1M tokens

  constructor(
    client: XRPLClient,
    daoAddress: string,
    registry: OracleRegistry
  ) {
    super();
    this.client = client;
    this.daoAddress = daoAddress;
    this.registry = registry;
    this.proposalManager = new ProposalManager(client, daoAddress, registry);
    this.votingSystem = new VotingSystem(client, daoAddress);
    this.router = new DecidabilityRouter();
    this.jury = new ConstitutionalJury(client);
    this.commitReveal = new CommitRevealProtocol(client, daoAddress);
  }

  /**
   * Set total voting supply for quorum calculations
   */
  setTotalVotingSupply(supply: string): void {
    this.totalVotingSupply = supply;
  }

  /**
   * Submit a new proposal
   */
  async submitProposal(input: ProposalInput): Promise<GovernanceProposal> {
    // Submit through proposal manager
    const proposal = await this.proposalManager.submit(input);

    // Create governance pipeline entry
    const govProposal: GovernanceProposal = {
      proposal,
      phase: GovernancePhase.Submitted,
    };

    this.pipeline.set(proposal.id, govProposal);

    // Emit event
    this.emit(GovernanceEvent.ProposalSubmitted, {
      proposalId: proposal.id,
      proposer: proposal.proposer,
      layer: proposal.layer,
    });

    // Automatically start oracle review
    this.startOracleReview(proposal.id);

    return govProposal;
  }

  /**
   * Start oracle review phase
   */
  private startOracleReview(proposalId: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.OracleReview;
    govProposal.proposal.status = ProposalStatus.ChannelAReview;

    this.emit(GovernanceEvent.OracleReviewStarted, {
      proposalId,
      oracleCount: this.registry.getActiveSet().length,
    });
  }

  /**
   * Process oracle verdicts (called after commit-reveal completes)
   */
  processOracleVerdicts(
    proposalId: string,
    aggregatedVerdict: AggregatedVerdict
  ): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) {
      throw new Error('Proposal not in pipeline');
    }

    // Update proposal with verdicts
    this.proposalManager.processOracleVerdicts(proposalId, aggregatedVerdict);

    // Get updated proposal
    const proposal = this.proposalManager.getProposal(proposalId);
    if (!proposal) return;

    govProposal.proposal = proposal;

    this.emit(GovernanceEvent.OracleReviewComplete, {
      proposalId,
      channelAPassed: aggregatedVerdict.channel_a_consensus?.pass,
      alignmentScore: aggregatedVerdict.channel_b_consensus?.semantic_alignment_score,
      decidabilityClass: aggregatedVerdict.channel_b_consensus?.decidability_class,
    });

    // Check if rejected
    if (proposal.status === ProposalStatus.Rejected) {
      this.rejectProposal(proposalId, proposal.rejection_reason || 'Oracle review failed');
      return;
    }

    // Route the proposal
    this.routeProposal(proposalId);
  }

  /**
   * Route proposal based on decidability class
   */
  private routeProposal(proposalId: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.Routing;

    // Get routing decision
    const decision = this.router.route(govProposal.proposal);
    govProposal.routing = decision;

    this.emit(GovernanceEvent.RoutingDecided, {
      proposalId,
      route: decision.route,
      friction: decision.friction,
      reason: decision.reason,
    });

    // Execute routing decision
    switch (decision.route) {
      case Route.Rejected:
        this.rejectProposal(proposalId, decision.reason);
        break;

      case Route.StandardVoting:
        this.startVoting(proposalId, decision.friction);
        break;

      case Route.ConstitutionalJury:
        this.startJuryReview(proposalId);
        break;

      case Route.PoUW:
        this.startPoUWVerification(proposalId);
        break;

      case Route.Emergency:
        // Emergency track (not implemented)
        this.startVoting(proposalId, calculateFriction(1.0)); // Minimal friction
        break;
    }
  }

  /**
   * Start voting phase
   */
  private startVoting(proposalId: string, friction: FrictionParams): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.Voting;
    govProposal.proposal.status = ProposalStatus.Voting;
    govProposal.proposal.friction = friction;

    // Open voting period
    this.votingSystem.openVotingPeriod(proposalId, friction);

    this.emit(GovernanceEvent.VotingOpened, {
      proposalId,
      friction,
      endTime: Date.now() + friction.timelock_duration * 1000,
    });
  }

  /**
   * Cast a vote
   */
  async castVote(
    proposalId: string,
    voterAddress: string,
    vote: Vote,
    votingPower: string
  ): Promise<void> {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal || govProposal.phase !== GovernancePhase.Voting) {
      throw new Error('Proposal not in voting phase');
    }

    await this.votingSystem.castVote(proposalId, voterAddress, vote, votingPower);

    this.emit(GovernanceEvent.VoteCast, {
      proposalId,
      voter: voterAddress,
      vote,
      power: votingPower,
    });
  }

  /**
   * Close voting and process results
   */
  closeVoting(proposalId: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal || govProposal.phase !== GovernancePhase.Voting) {
      throw new Error('Proposal not in voting phase');
    }

    // Tally votes
    const tally = this.votingSystem.closeVotingPeriod(
      proposalId,
      this.totalVotingSupply
    );
    govProposal.votingTally = tally;

    this.emit(GovernanceEvent.VotingClosed, {
      proposalId,
      tally,
    });

    if (tally.passed) {
      this.startTimelock(proposalId);
    } else {
      const reason = tally.quorum_reached
        ? 'Majority voted against'
        : 'Quorum not reached';
      this.rejectProposal(proposalId, reason);
    }
  }

  /**
   * Start jury review phase
   */
  private async startJuryReview(proposalId: string): Promise<void> {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.JuryReview;
    govProposal.proposal.status = ProposalStatus.RequiresHumanReview;

    // Select jury (need eligible accounts - mock for now)
    const eligibleAccounts = [
      { address: 'juror_1', balance: '10000000000', last_active: Date.now() },
      { address: 'juror_2', balance: '8000000000', last_active: Date.now() },
      { address: 'juror_3', balance: '5000000000', last_active: Date.now() },
      // ... would have 21+ eligible accounts in production
    ];

    // For testing, we'll just note that jury review is needed
    this.emit(GovernanceEvent.JurySelected, {
      proposalId,
      message: 'Jury selection required - insufficient eligible accounts for demo',
    });
  }

  /**
   * Record jury verdict and proceed
   */
  recordJuryVerdict(
    proposalId: string,
    verdict: 'APPROVED' | 'REJECTED' | 'NO_VERDICT',
    yesVotes: number,
    noVotes: number
  ): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal || govProposal.phase !== GovernancePhase.JuryReview) {
      throw new Error('Proposal not in jury review phase');
    }

    this.emit(GovernanceEvent.JuryVerdictReached, {
      proposalId,
      verdict,
      yesVotes,
      noVotes,
    });

    if (verdict === 'APPROVED') {
      // Jury approved - check if also needs token vote
      if (govProposal.routing?.requirements.some(r => r.type === 'MinQuorum')) {
        // L1 changes need token vote after jury approval
        this.startVoting(proposalId, govProposal.proposal.friction || calculateFriction(0.5));
      } else {
        // Can proceed directly to timelock
        this.startTimelock(proposalId);
      }
    } else {
      this.rejectProposal(proposalId, `Jury verdict: ${verdict}`);
    }
  }

  /**
   * Start PoUW verification (placeholder for COINjecture integration)
   */
  private startPoUWVerification(proposalId: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.PoUWVerification;

    // In production, would submit to COINjecture PoUW marketplace
    // For now, treat as automatic pass and proceed to voting
    console.log(`[GOVERNANCE] PoUW verification required for ${proposalId}`);
    console.log('[GOVERNANCE] Auto-approving for demo (COINjecture not integrated)');

    // Proceed to voting after "verification"
    this.startVoting(
      proposalId,
      govProposal.proposal.friction || calculateFriction(0.8)
    );
  }

  /**
   * Start timelock period
   */
  private startTimelock(proposalId: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.Timelock;
    govProposal.proposal.status = ProposalStatus.Passed;

    const friction = govProposal.proposal.friction || calculateFriction(0.5);
    govProposal.timelockExpiry = Date.now() + friction.timelock_duration * 1000;

    this.emit(GovernanceEvent.ProposalPassed, {
      proposalId,
    });

    this.emit(GovernanceEvent.TimelockStarted, {
      proposalId,
      expiresAt: govProposal.timelockExpiry,
      duration: friction.timelock_duration,
    });
  }

  /**
   * Check if timelock has expired and proposal can be executed
   */
  checkTimelockExpiry(proposalId: string): boolean {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal || govProposal.phase !== GovernancePhase.Timelock) {
      return false;
    }

    if (govProposal.timelockExpiry && Date.now() >= govProposal.timelockExpiry) {
      govProposal.phase = GovernancePhase.ReadyToExecute;

      this.emit(GovernanceEvent.TimelockExpired, {
        proposalId,
      });

      return true;
    }

    return false;
  }

  /**
   * Execute a proposal
   */
  async executeProposal(proposalId: string): Promise<void> {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal || govProposal.phase !== GovernancePhase.ReadyToExecute) {
      throw new Error('Proposal not ready for execution');
    }

    // In production, would execute the proposal logic on-chain
    // For now, just mark as executed
    govProposal.phase = GovernancePhase.Executed;
    govProposal.proposal.status = ProposalStatus.Executed;

    this.proposalManager.markExecuted(proposalId);

    this.emit(GovernanceEvent.ProposalExecuted, {
      proposalId,
    });
  }

  /**
   * Reject a proposal
   */
  private rejectProposal(proposalId: string, reason: string): void {
    const govProposal = this.pipeline.get(proposalId);
    if (!govProposal) return;

    govProposal.phase = GovernancePhase.Rejected;
    govProposal.proposal.status = ProposalStatus.Rejected;
    govProposal.proposal.rejection_reason = reason;

    this.emit(GovernanceEvent.ProposalRejected, {
      proposalId,
      reason,
    });
  }

  /**
   * Get governance proposal by ID
   */
  getProposal(proposalId: string): GovernanceProposal | undefined {
    return this.pipeline.get(proposalId);
  }

  /**
   * Get all proposals in pipeline
   */
  getAllProposals(): GovernanceProposal[] {
    return Array.from(this.pipeline.values());
  }

  /**
   * Get proposals by phase
   */
  getProposalsByPhase(phase: GovernancePhase): GovernanceProposal[] {
    return Array.from(this.pipeline.values()).filter(p => p.phase === phase);
  }

  /**
   * Get the voting system instance
   */
  getVotingSystem(): VotingSystem {
    return this.votingSystem;
  }

  /**
   * Get the proposal manager instance
   */
  getProposalManager(): ProposalManager {
    return this.proposalManager;
  }

  /**
   * Get the router instance
   */
  getRouter(): DecidabilityRouter {
    return this.router;
  }

  /**
   * Get the jury instance
   */
  getJury(): ConstitutionalJury {
    return this.jury;
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    pipeline: Array<[string, GovernanceProposal]>;
    voting: ReturnType<VotingSystem['exportState']>;
    proposals: ProposalState[];
  } {
    return {
      pipeline: Array.from(this.pipeline.entries()),
      voting: this.votingSystem.exportState(),
      proposals: this.proposalManager.exportState(),
    };
  }
}
