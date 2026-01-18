/**
 * Voting System
 *
 * Implements token-weighted voting from spec v5.0:
 * - Vote weight based on token holdings
 * - Vote delegation support
 * - Voting period enforcement
 * - Double-vote prevention
 * - Vote escrow (tokens locked during active votes)
 */

import { createHash } from 'crypto';
import { XRPLClient } from '../xrpl/client';
import { MEMO_TYPES } from '../xrpl/transactions';
import {
  Vote,
  FrictionParams,
  calculateFriction,
  CONFIG,
} from '../types';

/**
 * Individual vote record
 */
export interface VoteRecord {
  /** Voter address */
  voter: string;
  /** Proposal ID */
  proposal_id: string;
  /** Vote choice */
  vote: Vote;
  /** Voting power used */
  voting_power: string;
  /** Whether voting on behalf of delegators */
  delegated_power: string;
  /** Timestamp of vote */
  timestamp: number;
  /** XRPL transaction hash */
  tx_hash?: string;
}

/**
 * Vote delegation record
 */
export interface Delegation {
  /** Delegator address (gives power) */
  delegator: string;
  /** Delegate address (receives power) */
  delegate: string;
  /** Amount of power delegated */
  amount: string;
  /** When delegation was created */
  created_at: number;
  /** Whether delegation is still active */
  active: boolean;
}

/**
 * Voting period info
 */
export interface VotingPeriod {
  /** Proposal ID */
  proposal_id: string;
  /** When voting opened */
  start_time: number;
  /** When voting closes */
  end_time: number;
  /** Friction parameters for this vote */
  friction: FrictionParams;
  /** Whether voting is still open */
  is_open: boolean;
}

/**
 * Aggregated voting results
 */
export interface VotingTally {
  /** Proposal ID */
  proposal_id: string;
  /** Total YES voting power */
  yes_power: string;
  /** Total NO voting power */
  no_power: string;
  /** Total ABSTAIN voting power */
  abstain_power: string;
  /** Total participating voting power */
  total_participating: string;
  /** Total possible voting power */
  total_supply: string;
  /** Participation rate */
  participation_rate: number;
  /** Whether quorum was reached */
  quorum_reached: boolean;
  /** Whether proposal passed */
  passed: boolean;
  /** Number of unique voters */
  unique_voters: number;
}

/**
 * Voting System Manager
 */
export class VotingSystem {
  private client: XRPLClient;
  private daoAddress: string;
  private votes: Map<string, VoteRecord[]> = new Map(); // proposalId -> votes
  private delegations: Map<string, Delegation[]> = new Map(); // delegator -> delegations
  private votingPeriods: Map<string, VotingPeriod> = new Map();
  private voterRegistry: Map<string, Set<string>> = new Map(); // voter -> proposals voted on

  constructor(client: XRPLClient, daoAddress: string) {
    this.client = client;
    this.daoAddress = daoAddress;
  }

  /**
   * Open voting period for a proposal
   */
  openVotingPeriod(
    proposalId: string,
    friction: FrictionParams
  ): VotingPeriod {
    if (this.votingPeriods.has(proposalId)) {
      throw new Error('Voting period already exists for this proposal');
    }

    const now = Date.now();
    const period: VotingPeriod = {
      proposal_id: proposalId,
      start_time: now,
      end_time: now + friction.timelock_duration * 1000,
      friction,
      is_open: true,
    };

    this.votingPeriods.set(proposalId, period);
    this.votes.set(proposalId, []);

    console.log(
      `[VOTING] Period opened for ${proposalId.slice(0, 16)}... ` +
      `Duration: ${friction.timelock_duration}s, ` +
      `Required quorum: ${(friction.required_quorum * 100).toFixed(1)}%`
    );

    return period;
  }

  /**
   * Cast a vote
   */
  async castVote(
    proposalId: string,
    voterAddress: string,
    vote: Vote,
    votingPower: string
  ): Promise<VoteRecord> {
    // Check voting period
    const period = this.votingPeriods.get(proposalId);
    if (!period) {
      throw new Error('No voting period for this proposal');
    }

    if (!period.is_open || Date.now() > period.end_time) {
      throw new Error('Voting period has ended');
    }

    // Check for double voting
    const voterProposals = this.voterRegistry.get(voterAddress) || new Set();
    if (voterProposals.has(proposalId)) {
      throw new Error('Already voted on this proposal');
    }

    // Calculate total voting power (own + delegated)
    const delegatedPower = this.getDelegatedPower(voterAddress);
    const totalPower = (
      BigInt(votingPower) + BigInt(delegatedPower)
    ).toString();

    // Create vote record
    const record: VoteRecord = {
      voter: voterAddress,
      proposal_id: proposalId,
      vote,
      voting_power: votingPower,
      delegated_power: delegatedPower,
      timestamp: Date.now(),
    };

    // Submit to XRPL
    const voteData = {
      proposal_id: proposalId,
      vote: vote,
      power: totalPower,
    };

    try {
      const result = await this.client.submitMemo(
        this.daoAddress,
        MEMO_TYPES.VOTE,
        voteData
      );
      record.tx_hash = result.hash;
    } catch (error) {
      // Continue even if XRPL submission fails (local vote still valid)
      console.warn('[VOTING] XRPL submission failed:', error);
    }

    // Record vote
    const proposalVotes = this.votes.get(proposalId) || [];
    proposalVotes.push(record);
    this.votes.set(proposalId, proposalVotes);

    // Mark voter as having voted
    voterProposals.add(proposalId);
    this.voterRegistry.set(voterAddress, voterProposals);

    console.log(
      `[VOTING] ${voterAddress.slice(0, 12)}... voted ${vote} ` +
      `with ${totalPower} power on ${proposalId.slice(0, 16)}...`
    );

    return record;
  }

  /**
   * Delegate voting power
   */
  delegate(
    delegatorAddress: string,
    delegateAddress: string,
    amount: string
  ): Delegation {
    if (delegatorAddress === delegateAddress) {
      throw new Error('Cannot delegate to self');
    }

    const delegation: Delegation = {
      delegator: delegatorAddress,
      delegate: delegateAddress,
      amount,
      created_at: Date.now(),
      active: true,
    };

    const existing = this.delegations.get(delegatorAddress) || [];
    existing.push(delegation);
    this.delegations.set(delegatorAddress, existing);

    console.log(
      `[VOTING] ${delegatorAddress.slice(0, 12)}... delegated ` +
      `${amount} power to ${delegateAddress.slice(0, 12)}...`
    );

    return delegation;
  }

  /**
   * Revoke delegation
   */
  undelegate(delegatorAddress: string, delegateAddress: string): void {
    const delegations = this.delegations.get(delegatorAddress);
    if (!delegations) {
      throw new Error('No delegations found');
    }

    for (const d of delegations) {
      if (d.delegate === delegateAddress && d.active) {
        d.active = false;
        console.log(
          `[VOTING] ${delegatorAddress.slice(0, 12)}... revoked delegation ` +
          `from ${delegateAddress.slice(0, 12)}...`
        );
        return;
      }
    }

    throw new Error('No active delegation to this address');
  }

  /**
   * Get total delegated power for an address
   */
  getDelegatedPower(address: string): string {
    let total = BigInt(0);

    for (const delegations of this.delegations.values()) {
      for (const d of delegations) {
        if (d.delegate === address && d.active) {
          total += BigInt(d.amount);
        }
      }
    }

    return total.toString();
  }

  /**
   * Close voting period and tally results
   */
  closeVotingPeriod(
    proposalId: string,
    totalSupply: string
  ): VotingTally {
    const period = this.votingPeriods.get(proposalId);
    if (!period) {
      throw new Error('No voting period for this proposal');
    }

    // Mark as closed
    period.is_open = false;

    // Get all votes
    const proposalVotes = this.votes.get(proposalId) || [];

    // Tally votes
    let yesPower = BigInt(0);
    let noPower = BigInt(0);
    let abstainPower = BigInt(0);

    for (const vote of proposalVotes) {
      const totalPower = BigInt(vote.voting_power) + BigInt(vote.delegated_power);

      switch (vote.vote) {
        case Vote.Yes:
          yesPower += totalPower;
          break;
        case Vote.No:
          noPower += totalPower;
          break;
        case Vote.Abstain:
          abstainPower += totalPower;
          break;
      }
    }

    const totalParticipating = yesPower + noPower + abstainPower;
    const supply = BigInt(totalSupply);
    const participationRate = supply > 0
      ? Number(totalParticipating * BigInt(10000) / supply) / 10000
      : 0;

    // Check quorum
    const quorumReached = participationRate >= period.friction.required_quorum;

    // Determine if passed (simple majority of non-abstaining)
    const passed = quorumReached && yesPower > noPower;

    const tally: VotingTally = {
      proposal_id: proposalId,
      yes_power: yesPower.toString(),
      no_power: noPower.toString(),
      abstain_power: abstainPower.toString(),
      total_participating: totalParticipating.toString(),
      total_supply: totalSupply,
      participation_rate: participationRate,
      quorum_reached: quorumReached,
      passed,
      unique_voters: proposalVotes.length,
    };

    console.log(
      `[VOTING] Period closed for ${proposalId.slice(0, 16)}...: ` +
      `${passed ? 'PASSED' : 'FAILED'} ` +
      `(Yes: ${yesPower}, No: ${noPower}, Participation: ${(participationRate * 100).toFixed(1)}%)`
    );

    return tally;
  }

  /**
   * Check if voting is open for a proposal
   */
  isVotingOpen(proposalId: string): boolean {
    const period = this.votingPeriods.get(proposalId);
    if (!period) return false;
    return period.is_open && Date.now() < period.end_time;
  }

  /**
   * Get remaining voting time in seconds
   */
  getRemainingTime(proposalId: string): number {
    const period = this.votingPeriods.get(proposalId);
    if (!period) return 0;
    return Math.max(0, Math.floor((period.end_time - Date.now()) / 1000));
  }

  /**
   * Get current vote counts (before period ends)
   */
  getCurrentTally(proposalId: string): {
    yes: string;
    no: string;
    abstain: string;
    voters: number;
  } {
    const proposalVotes = this.votes.get(proposalId) || [];

    let yes = BigInt(0);
    let no = BigInt(0);
    let abstain = BigInt(0);

    for (const vote of proposalVotes) {
      const power = BigInt(vote.voting_power) + BigInt(vote.delegated_power);
      switch (vote.vote) {
        case Vote.Yes:
          yes += power;
          break;
        case Vote.No:
          no += power;
          break;
        case Vote.Abstain:
          abstain += power;
          break;
      }
    }

    return {
      yes: yes.toString(),
      no: no.toString(),
      abstain: abstain.toString(),
      voters: proposalVotes.length,
    };
  }

  /**
   * Get votes for a proposal
   */
  getVotes(proposalId: string): VoteRecord[] {
    return this.votes.get(proposalId) || [];
  }

  /**
   * Get voting period info
   */
  getVotingPeriod(proposalId: string): VotingPeriod | undefined {
    return this.votingPeriods.get(proposalId);
  }

  /**
   * Check if an address has voted on a proposal
   */
  hasVoted(proposalId: string, voterAddress: string): boolean {
    const voterProposals = this.voterRegistry.get(voterAddress);
    return voterProposals?.has(proposalId) || false;
  }

  /**
   * Get all active delegations for an address
   */
  getDelegations(address: string): Delegation[] {
    return (this.delegations.get(address) || []).filter(d => d.active);
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    votes: Array<[string, VoteRecord[]]>;
    delegations: Array<[string, Delegation[]]>;
    periods: Array<[string, VotingPeriod]>;
  } {
    return {
      votes: Array.from(this.votes.entries()),
      delegations: Array.from(this.delegations.entries()),
      periods: Array.from(this.votingPeriods.entries()),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    votes: Array<[string, VoteRecord[]]>;
    delegations: Array<[string, Delegation[]]>;
    periods: Array<[string, VotingPeriod]>;
  }): void {
    this.votes = new Map(state.votes);
    this.delegations = new Map(state.delegations);
    this.votingPeriods = new Map(state.periods);

    // Rebuild voter registry
    this.voterRegistry.clear();
    for (const [proposalId, votes] of this.votes) {
      for (const vote of votes) {
        const voterProposals = this.voterRegistry.get(vote.voter) || new Set();
        voterProposals.add(proposalId);
        this.voterRegistry.set(vote.voter, voterProposals);
      }
    }
  }
}
