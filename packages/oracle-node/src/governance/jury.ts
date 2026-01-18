/**
 * Constitutional Jury System
 *
 * Implements the human review mechanism from spec v5.0:
 * - VRF-based jury selection (21 members)
 * - sqrt(stake) weighted randomness
 * - 72-hour voting period
 * - 2/3 supermajority required
 */

import { createHash, randomBytes } from 'crypto';
import { XRPLClient } from '../xrpl/client';
import { CONFIG } from '../types';

/**
 * Jury member info
 */
export interface JuryMember {
  address: string;
  stake: string;
  selected_at: number;
  vote: 'YES' | 'NO' | 'ABSTAIN' | null;
  voted_at: number | null;
}

/**
 * Jury selection result
 */
export interface JurySelection {
  proposal_id: string;
  seed: string;
  members: JuryMember[];
  voting_deadline: number;
}

/**
 * Eligible account for jury duty
 */
export interface EligibleAccount {
  address: string;
  balance: string;
  last_active: number;
}

/**
 * Constitutional Jury Manager
 */
export class ConstitutionalJury {
  private client: XRPLClient;
  private jurySize: number;
  private votingPeriod: number;
  private superMajority: number;
  private activeJuries: Map<string, JurySelection> = new Map();

  constructor(
    client: XRPLClient,
    jurySize: number = CONFIG.JURY_SIZE,
    votingPeriod: number = CONFIG.JURY_VOTING_PERIOD,
    superMajority: number = CONFIG.JURY_SUPERMAJORITY
  ) {
    this.client = client;
    this.jurySize = jurySize;
    this.votingPeriod = votingPeriod;
    this.superMajority = superMajority;
  }

  /**
   * Generate VRF seed from proposal submission block
   *
   * In production, this would use the block hash where the proposal
   * was submitted. For now, we use a deterministic hash.
   */
  async generateVRFSeed(proposalId: string, blockHash?: string): Promise<string> {
    // If block hash provided, use it
    if (blockHash) {
      return createHash('sha256')
        .update(proposalId + blockHash)
        .digest('hex');
    }

    // Otherwise, get current ledger hash
    const ledgerIndex = await this.client.getLedgerIndex();
    const ledgerResponse = await this.client.getClient().request({
      command: 'ledger',
      ledger_index: ledgerIndex,
    });

    const ledgerHash = ledgerResponse.result.ledger_hash;
    return createHash('sha256')
      .update(proposalId + ledgerHash)
      .digest('hex');
  }

  /**
   * Select jury members using weighted random selection
   *
   * Weight is sqrt(stake) to balance influence between
   * large and small stakeholders.
   */
  async selectJury(
    proposalId: string,
    eligibleAccounts: EligibleAccount[],
    seed?: string
  ): Promise<JurySelection> {
    // Generate or use provided seed
    const vrfSeed = seed || await this.generateVRFSeed(proposalId);

    // Filter to recently active accounts (last 3 months)
    const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const active = eligibleAccounts.filter(a => a.last_active > threeMonthsAgo);

    if (active.length < this.jurySize) {
      throw new Error(`Not enough eligible accounts: ${active.length} < ${this.jurySize}`);
    }

    // Calculate weights (sqrt of stake)
    const weighted = active.map(account => ({
      ...account,
      weight: Math.sqrt(parseFloat(account.balance)),
    }));

    // Total weight
    const totalWeight = weighted.reduce((sum, a) => sum + a.weight, 0);

    // Select jury members using weighted random selection
    const selected: JuryMember[] = [];
    const selectedAddresses = new Set<string>();

    // Use seed to create deterministic random sequence
    let currentSeed = vrfSeed;

    while (selected.length < this.jurySize) {
      // Generate next random value from seed
      currentSeed = createHash('sha256')
        .update(currentSeed + selected.length.toString())
        .digest('hex');

      // Convert to number between 0 and 1
      const randomValue = parseInt(currentSeed.slice(0, 8), 16) / 0xffffffff;
      const targetWeight = randomValue * totalWeight;

      // Find account at this weight position
      let cumulativeWeight = 0;
      for (const account of weighted) {
        cumulativeWeight += account.weight;
        if (cumulativeWeight >= targetWeight && !selectedAddresses.has(account.address)) {
          selected.push({
            address: account.address,
            stake: account.balance,
            selected_at: Date.now(),
            vote: null,
            voted_at: null,
          });
          selectedAddresses.add(account.address);
          break;
        }
      }
    }

    const jurySelection: JurySelection = {
      proposal_id: proposalId,
      seed: vrfSeed,
      members: selected,
      voting_deadline: Date.now() + this.votingPeriod * 1000,
    };

    this.activeJuries.set(proposalId, jurySelection);
    return jurySelection;
  }

  /**
   * Record a jury vote
   */
  recordVote(
    proposalId: string,
    jurorAddress: string,
    vote: 'YES' | 'NO' | 'ABSTAIN'
  ): void {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) {
      throw new Error('No active jury for this proposal');
    }

    if (Date.now() > jury.voting_deadline) {
      throw new Error('Voting period has ended');
    }

    const member = jury.members.find(m => m.address === jurorAddress);
    if (!member) {
      throw new Error('Not a jury member');
    }

    if (member.vote !== null) {
      throw new Error('Already voted');
    }

    member.vote = vote;
    member.voted_at = Date.now();
  }

  /**
   * Resolve jury verdict
   */
  resolveVerdict(proposalId: string): {
    verdict: 'APPROVED' | 'REJECTED' | 'NO_VERDICT';
    supermajority_reached: boolean;
    yes_votes: number;
    no_votes: number;
    abstain_votes: number;
    non_voters: string[];
  } {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) {
      throw new Error('No active jury for this proposal');
    }

    // Count votes
    let yesVotes = 0;
    let noVotes = 0;
    let abstainVotes = 0;
    const nonVoters: string[] = [];

    for (const member of jury.members) {
      switch (member.vote) {
        case 'YES':
          yesVotes++;
          break;
        case 'NO':
          noVotes++;
          break;
        case 'ABSTAIN':
          abstainVotes++;
          break;
        default:
          nonVoters.push(member.address);
      }
    }

    // Calculate supermajority threshold
    const votingMembers = yesVotes + noVotes; // Abstains don't count
    const threshold = Math.ceil(votingMembers * this.superMajority);

    let verdict: 'APPROVED' | 'REJECTED' | 'NO_VERDICT';
    let supermajorityReached: boolean;

    if (yesVotes >= threshold) {
      verdict = 'APPROVED';
      supermajorityReached = true;
    } else if (noVotes >= threshold) {
      verdict = 'REJECTED';
      supermajorityReached = true;
    } else {
      verdict = 'NO_VERDICT';
      supermajorityReached = false;
    }

    return {
      verdict,
      supermajority_reached: supermajorityReached,
      yes_votes: yesVotes,
      no_votes: noVotes,
      abstain_votes: abstainVotes,
      non_voters: nonVoters,
    };
  }

  /**
   * Get active jury for a proposal
   */
  getJury(proposalId: string): JurySelection | undefined {
    return this.activeJuries.get(proposalId);
  }

  /**
   * Check if address is a juror for a proposal
   */
  isJuror(proposalId: string, address: string): boolean {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) return false;
    return jury.members.some(m => m.address === address);
  }

  /**
   * Get juror vote status
   */
  getJurorStatus(proposalId: string, address: string): JuryMember | null {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) return null;
    return jury.members.find(m => m.address === address) || null;
  }

  /**
   * Check if voting period is still active
   */
  isVotingActive(proposalId: string): boolean {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) return false;
    return Date.now() < jury.voting_deadline;
  }

  /**
   * Get remaining voting time in seconds
   */
  getRemainingTime(proposalId: string): number {
    const jury = this.activeJuries.get(proposalId);
    if (!jury) return 0;
    return Math.max(0, Math.floor((jury.voting_deadline - Date.now()) / 1000));
  }

  /**
   * Clean up completed juries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [proposalId, jury] of this.activeJuries) {
      // Remove juries that are well past their deadline (24 hours buffer)
      if (now > jury.voting_deadline + 24 * 60 * 60 * 1000) {
        this.activeJuries.delete(proposalId);
      }
    }
  }
}
