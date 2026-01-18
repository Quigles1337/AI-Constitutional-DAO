/**
 * State Anchoring for COINjecture Bridge
 *
 * Anchors governance state to XRPL as Merkle roots for
 * future bridging to COINjecture NetB mainnet.
 *
 * The state root can be verified on COINjecture to:
 * 1. Prove proposal existence and status
 * 2. Verify oracle verdicts
 * 3. Validate voting results
 * 4. Enable cross-chain governance
 */

import * as crypto from 'crypto';
import { XRPLClient } from '../xrpl/client';
import { GovernanceProposal } from '../voting';
import { OracleInfo } from '../network';

/**
 * Merkle tree node for state anchoring
 */
interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  data?: string;
}

/**
 * State anchor record stored on XRPL
 */
export interface StateAnchor {
  /** Merkle root of all proposal states */
  proposals_root: string;
  /** Merkle root of oracle registry */
  oracles_root: string;
  /** Combined state root */
  state_root: string;
  /** XRPL ledger index when anchored */
  ledger_index: number;
  /** Timestamp of anchoring */
  timestamp: number;
  /** Number of proposals included */
  proposal_count: number;
  /** Number of oracles included */
  oracle_count: number;
}

/**
 * Proof for verifying inclusion in state
 */
export interface MerkleProof {
  /** The leaf hash being proven */
  leaf: string;
  /** Sibling hashes for verification path */
  path: { hash: string; position: 'left' | 'right' }[];
  /** The root this proof validates against */
  root: string;
}

/**
 * State anchor manager for bridging to COINjecture
 */
export class StateAnchorManager {
  private xrplClient: XRPLClient;
  private anchorAddress: string;
  private anchors: StateAnchor[] = [];

  constructor(xrplClient: XRPLClient, anchorAddress: string) {
    this.xrplClient = xrplClient;
    this.anchorAddress = anchorAddress;
  }

  /**
   * Compute Merkle root of all proposals
   */
  computeProposalsRoot(proposals: GovernanceProposal[]): string {
    if (proposals.length === 0) {
      return this.hashData('EMPTY_PROPOSALS');
    }

    const leaves = proposals.map(p => this.hashProposal(p));
    return this.computeMerkleRoot(leaves);
  }

  /**
   * Compute Merkle root of oracle registry
   */
  computeOraclesRoot(oracles: OracleInfo[]): string {
    if (oracles.length === 0) {
      return this.hashData('EMPTY_ORACLES');
    }

    const leaves = oracles.map(o => this.hashOracle(o));
    return this.computeMerkleRoot(leaves);
  }

  /**
   * Compute combined state root
   */
  computeStateRoot(proposalsRoot: string, oraclesRoot: string): string {
    return this.hashPair(proposalsRoot, oraclesRoot);
  }

  /**
   * Create a full state anchor
   */
  async createAnchor(
    proposals: GovernanceProposal[],
    oracles: OracleInfo[]
  ): Promise<StateAnchor> {
    const proposalsRoot = this.computeProposalsRoot(proposals);
    const oraclesRoot = this.computeOraclesRoot(oracles);
    const stateRoot = this.computeStateRoot(proposalsRoot, oraclesRoot);

    const ledgerIndex = await this.xrplClient.getLedgerIndex();

    const anchor: StateAnchor = {
      proposals_root: proposalsRoot,
      oracles_root: oraclesRoot,
      state_root: stateRoot,
      ledger_index: ledgerIndex,
      timestamp: Date.now(),
      proposal_count: proposals.length,
      oracle_count: oracles.length,
    };

    this.anchors.push(anchor);
    return anchor;
  }

  /**
   * Anchor state root to XRPL
   */
  async anchorToXRPL(anchor: StateAnchor): Promise<string> {
    const memoData = {
      type: 'STATE_ANCHOR',
      version: 1,
      root: anchor.state_root,
      proposals_root: anchor.proposals_root,
      oracles_root: anchor.oracles_root,
      proposal_count: anchor.proposal_count,
      oracle_count: anchor.oracle_count,
      timestamp: anchor.timestamp,
    };

    const result = await this.xrplClient.submitMemo(
      this.anchorAddress,
      'DAO_STATE_ANCHOR',
      JSON.stringify(memoData)
    );

    return result.hash;
  }

  /**
   * Generate inclusion proof for a proposal
   */
  generateProposalProof(
    proposal: GovernanceProposal,
    allProposals: GovernanceProposal[]
  ): MerkleProof {
    const leaves = allProposals.map(p => this.hashProposal(p));
    const targetLeaf = this.hashProposal(proposal);
    const targetIndex = leaves.indexOf(targetLeaf);

    if (targetIndex === -1) {
      throw new Error('Proposal not found in state');
    }

    return this.generateMerkleProof(leaves, targetIndex);
  }

  /**
   * Generate inclusion proof for an oracle
   */
  generateOracleProof(
    oracle: OracleInfo,
    allOracles: OracleInfo[]
  ): MerkleProof {
    const leaves = allOracles.map(o => this.hashOracle(o));
    const targetLeaf = this.hashOracle(oracle);
    const targetIndex = leaves.indexOf(targetLeaf);

    if (targetIndex === -1) {
      throw new Error('Oracle not found in state');
    }

    return this.generateMerkleProof(leaves, targetIndex);
  }

  /**
   * Verify a Merkle proof
   */
  verifyProof(proof: MerkleProof): boolean {
    let currentHash = proof.leaf;

    for (const step of proof.path) {
      if (step.position === 'left') {
        currentHash = this.hashPair(step.hash, currentHash);
      } else {
        currentHash = this.hashPair(currentHash, step.hash);
      }
    }

    return currentHash === proof.root;
  }

  /**
   * Get latest anchor
   */
  getLatestAnchor(): StateAnchor | undefined {
    return this.anchors[this.anchors.length - 1];
  }

  /**
   * Get all anchors
   */
  getAllAnchors(): StateAnchor[] {
    return [...this.anchors];
  }

  /**
   * Export state for COINjecture bridge
   */
  exportForBridge(anchor: StateAnchor): string {
    return JSON.stringify({
      version: 1,
      network: 'xrpl',
      target: 'coinjecture',
      anchor: {
        state_root: anchor.state_root,
        proposals_root: anchor.proposals_root,
        oracles_root: anchor.oracles_root,
        ledger_index: anchor.ledger_index,
        timestamp: anchor.timestamp,
        counts: {
          proposals: anchor.proposal_count,
          oracles: anchor.oracle_count,
        },
      },
    });
  }

  // ========================
  // Private Helpers
  // ========================

  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private hashPair(left: string, right: string): string {
    return crypto
      .createHash('sha256')
      .update(left + right)
      .digest('hex');
  }

  private hashProposal(proposal: GovernanceProposal): string {
    const data = JSON.stringify({
      id: proposal.proposal.id,
      status: proposal.proposal.status,
      layer: proposal.proposal.layer,
      phase: proposal.phase,
      proposer: proposal.proposal.proposer,
      logic_hash: this.hashData(proposal.proposal.logic_ast),
      voting_tally: proposal.votingTally,
    });
    return this.hashData(data);
  }

  private hashOracle(oracle: OracleInfo): string {
    const data = JSON.stringify({
      address: oracle.address,
      status: oracle.status,
      bond_amount: oracle.bond_amount,
      metrics: oracle.metrics,
    });
    return this.hashData(data);
  }

  private computeMerkleRoot(leaves: string[]): string {
    if (leaves.length === 0) {
      return this.hashData('EMPTY');
    }

    if (leaves.length === 1) {
      return leaves[0];
    }

    // Pad to power of 2
    const paddedLeaves = [...leaves];
    while ((paddedLeaves.length & (paddedLeaves.length - 1)) !== 0) {
      paddedLeaves.push(paddedLeaves[paddedLeaves.length - 1]);
    }

    let currentLevel = paddedLeaves;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  private generateMerkleProof(leaves: string[], index: number): MerkleProof {
    // Pad to power of 2
    const paddedLeaves = [...leaves];
    while ((paddedLeaves.length & (paddedLeaves.length - 1)) !== 0) {
      paddedLeaves.push(paddedLeaves[paddedLeaves.length - 1]);
    }

    const path: { hash: string; position: 'left' | 'right' }[] = [];
    let currentIndex = index;
    let currentLevel = paddedLeaves;

    while (currentLevel.length > 1) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      const position: 'left' | 'right' = currentIndex % 2 === 0 ? 'right' : 'left';

      path.push({
        hash: currentLevel[siblingIndex],
        position,
      });

      // Build next level
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        nextLevel.push(this.hashPair(currentLevel[i], currentLevel[i + 1]));
      }

      currentIndex = Math.floor(currentIndex / 2);
      currentLevel = nextLevel;
    }

    return {
      leaf: leaves[index],
      path,
      root: currentLevel[0],
    };
  }
}

/**
 * Bridge state format for COINjecture
 */
export interface COINjectureBridgeState {
  version: number;
  network: 'xrpl';
  target: 'coinjecture';
  anchor: {
    state_root: string;
    proposals_root: string;
    oracles_root: string;
    ledger_index: number;
    timestamp: number;
    counts: {
      proposals: number;
      oracles: number;
    };
  };
}

/**
 * Parse bridge state from JSON
 */
export function parseBridgeState(json: string): COINjectureBridgeState {
  return JSON.parse(json) as COINjectureBridgeState;
}
