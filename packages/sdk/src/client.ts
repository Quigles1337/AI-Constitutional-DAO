/**
 * AI Constitution DAO SDK - Client
 *
 * Main client for interacting with the AI Constitution DAO governance system.
 * Provides a high-level API for proposals, voting, and oracle operations.
 */

import { EventEmitter } from 'eventemitter3';
import { Wallet } from 'xrpl';
import {
  XRPLClient,
  GovernanceOrchestrator,
  OracleRegistry,
  StakingManager,
  VotingSystem,
  GovernanceProposal,
  GovernancePhase,
  GovernanceEvent,
  OracleStatus,
  OracleInfo,
  ProposalInput,
  Vote,
  GovernanceLayer,
  Proposal,
  StakingPosition,
} from '@ai-constitution-dao/oracle-node';

/**
 * SDK Configuration
 */
export interface DAOClientConfig {
  /** XRPL network to connect to */
  network: 'testnet' | 'devnet' | 'mainnet';
  /** Wallet seed for signing transactions */
  walletSeed?: string;
  /** DAO treasury address */
  daoTreasuryAddress?: string;
  /** Anthropic API key for Channel B */
  anthropicApiKey?: string;
}

/**
 * Event types emitted by the client
 */
export interface DAOClientEvents {
  connected: () => void;
  disconnected: () => void;
  proposal: (proposal: GovernanceProposal) => void;
  vote: (proposalId: string, voter: string, vote: Vote) => void;
  phaseChange: (proposalId: string, phase: GovernancePhase) => void;
  oracleVerdict: (proposalId: string, verdict: any) => void;
  error: (error: Error) => void;
}

/**
 * Main SDK client for AI Constitution DAO
 *
 * @example
 * ```typescript
 * const client = new DAOClient({
 *   network: 'testnet',
 *   walletSeed: 'sEdxxxxxxx',
 * });
 *
 * await client.connect();
 *
 * // Submit a proposal
 * const proposal = await client.submitProposal({
 *   text: 'Increase oracle rewards by 10%',
 *   logic_ast: '{"type": "parameter_change", "target": "oracle_rewards", "value": 1.1}',
 *   layer: GovernanceLayer.L2Operational,
 * });
 *
 * // Vote on a proposal
 * await client.vote(proposal.proposal.id, Vote.Yes);
 *
 * // Disconnect when done
 * await client.disconnect();
 * ```
 */
export class DAOClient extends EventEmitter<DAOClientEvents> {
  private config: DAOClientConfig;
  private xrplClient: XRPLClient | null = null;
  private orchestrator: GovernanceOrchestrator | null = null;
  private registry: OracleRegistry | null = null;
  private stakingManager: StakingManager | null = null;
  private wallet: Wallet | null = null;

  constructor(config: DAOClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to the XRPL network and initialize services
   */
  async connect(): Promise<void> {
    try {
      // Create XRPL client
      this.xrplClient = new XRPLClient(this.config.network);
      await this.xrplClient.connect();

      // Set up wallet if seed provided
      if (this.config.walletSeed) {
        this.wallet = Wallet.fromSeed(this.config.walletSeed);
        this.xrplClient.setWallet(this.wallet);
      }

      // Initialize services
      this.orchestrator = new GovernanceOrchestrator(this.xrplClient, {
        daoTreasuryAddress: this.config.daoTreasuryAddress || 'rDAOTreasury123',
        anthropicApiKey: this.config.anthropicApiKey,
      });

      this.registry = new OracleRegistry(this.xrplClient);

      this.stakingManager = new StakingManager(this.xrplClient, {
        daoTreasuryAddress: this.config.daoTreasuryAddress || 'rDAOTreasury123',
        walletAddress: this.wallet?.address,
      });

      this.emit('connected');
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from the network
   */
  async disconnect(): Promise<void> {
    if (this.xrplClient) {
      await this.xrplClient.disconnect();
      this.xrplClient = null;
    }
    this.orchestrator = null;
    this.registry = null;
    this.stakingManager = null;
    this.emit('disconnected');
  }

  /**
   * Check if connected to the network
   */
  isConnected(): boolean {
    return this.xrplClient?.isConnected() ?? false;
  }

  /**
   * Get the wallet address
   */
  getAddress(): string | undefined {
    return this.wallet?.address;
  }

  // ========================
  // Proposal Operations
  // ========================

  /**
   * Submit a new governance proposal
   */
  async submitProposal(input: ProposalInput): Promise<GovernanceProposal> {
    this.ensureConnected();
    const proposal = await this.orchestrator!.submitProposal(input);
    this.emit('proposal', proposal);
    return proposal;
  }

  /**
   * Get a proposal by ID
   */
  getProposal(proposalId: string): GovernanceProposal | undefined {
    this.ensureConnected();
    return this.orchestrator!.getProposal(proposalId);
  }

  /**
   * Get all proposals
   */
  getAllProposals(): GovernanceProposal[] {
    this.ensureConnected();
    return this.orchestrator!.getAllProposals();
  }

  /**
   * Get proposals filtered by phase
   */
  getProposalsByPhase(phase: GovernancePhase): GovernanceProposal[] {
    this.ensureConnected();
    return this.orchestrator!.getAllProposals().filter(p => p.phase === phase);
  }

  /**
   * Get proposals filtered by layer
   */
  getProposalsByLayer(layer: GovernanceLayer): GovernanceProposal[] {
    this.ensureConnected();
    return this.orchestrator!.getAllProposals().filter(
      p => p.proposal.layer === layer
    );
  }

  // ========================
  // Voting Operations
  // ========================

  /**
   * Cast a vote on a proposal
   */
  async vote(
    proposalId: string,
    vote: Vote,
    votingPower?: string
  ): Promise<void> {
    this.ensureConnected();
    this.ensureWallet();

    const power = votingPower || '100000000000'; // Default 100k XRP voting power
    await this.orchestrator!.castVote(
      proposalId,
      this.wallet!.address,
      vote,
      power
    );

    this.emit('vote', proposalId, this.wallet!.address, vote);
  }

  /**
   * Get voting power for an address
   */
  getVotingPower(address?: string): string {
    this.ensureConnected();
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }
    return this.orchestrator!.getVotingSystem().getDelegatedPower(targetAddress);
  }

  /**
   * Delegate voting power to another address
   */
  delegate(toAddress: string, amount: string): void {
    this.ensureConnected();
    this.ensureWallet();
    this.orchestrator!.getVotingSystem().delegate(
      this.wallet!.address,
      toAddress,
      amount
    );
  }

  /**
   * Remove delegation from an address
   */
  undelegate(fromAddress: string): void {
    this.ensureConnected();
    this.ensureWallet();
    this.orchestrator!.getVotingSystem().undelegate(
      this.wallet!.address,
      fromAddress
    );
  }

  /**
   * Get current vote tally for a proposal
   */
  getVoteTally(proposalId: string): { yes: string; no: string; abstain: string; voters: number } {
    this.ensureConnected();
    return this.orchestrator!.getVotingSystem().getCurrentTally(proposalId);
  }

  // ========================
  // Oracle Operations
  // ========================

  /**
   * Register as an oracle operator
   */
  async registerOracle(bondAmount?: string): Promise<StakingPosition | undefined> {
    this.ensureConnected();
    this.ensureWallet();
    const result = await this.stakingManager!.stake(bondAmount);
    return result.position;
  }

  /**
   * Get oracle status for an address
   */
  async getOracleStatus(address?: string): Promise<StakingPosition | undefined> {
    this.ensureConnected();
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }
    return this.stakingManager!.getPosition(targetAddress);
  }

  /**
   * Get all registered oracles
   */
  getAllOracles(): OracleInfo[] {
    this.ensureConnected();
    return this.registry!.getAllOperators();
  }

  /**
   * Get active oracle set
   */
  getActiveOracles(): OracleInfo[] {
    this.ensureConnected();
    return this.registry!.getAllOperators().filter(
      o => o.status === OracleStatus.Active
    );
  }

  /**
   * Increase oracle stake
   */
  async increaseOracleStake(amount: string): Promise<StakingPosition | undefined> {
    this.ensureConnected();
    this.ensureWallet();
    const result = await this.stakingManager!.increaseStake(amount);
    return result.position;
  }

  /**
   * Initiate oracle unstaking
   */
  async initiateUnstake(): Promise<void> {
    this.ensureConnected();
    this.ensureWallet();
    await this.stakingManager!.initiateUnstake();
  }

  /**
   * Complete oracle unstaking after epoch delay
   */
  async completeUnstake(): Promise<void> {
    this.ensureConnected();
    this.ensureWallet();
    await this.stakingManager!.completeUnstake();
  }

  /**
   * Claim oracle rewards
   */
  async claimRewards(): Promise<void> {
    this.ensureConnected();
    this.ensureWallet();
    await this.stakingManager!.claimRewards();
  }

  // ========================
  // Utility Methods
  // ========================

  /**
   * Get account balance in XRP
   */
  async getBalance(address?: string): Promise<string> {
    this.ensureConnected();
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }
    return this.xrplClient!.getBalance(targetAddress);
  }

  /**
   * Fund wallet from testnet faucet (testnet/devnet only)
   */
  async fundWallet(): Promise<{ balance: number }> {
    this.ensureConnected();
    if (this.config.network === 'mainnet') {
      throw new Error('Cannot use faucet on mainnet');
    }
    return this.xrplClient!.fundWallet();
  }

  /**
   * Get the underlying XRPL client
   */
  getXRPLClient(): XRPLClient {
    this.ensureConnected();
    return this.xrplClient!;
  }

  /**
   * Get the governance orchestrator
   */
  getOrchestrator(): GovernanceOrchestrator {
    this.ensureConnected();
    return this.orchestrator!;
  }

  // ========================
  // Private Helpers
  // ========================

  private ensureConnected(): void {
    if (!this.xrplClient || !this.xrplClient.isConnected()) {
      throw new Error('Not connected. Call connect() first.');
    }
  }

  private ensureWallet(): void {
    if (!this.wallet) {
      throw new Error('No wallet configured. Provide walletSeed in config.');
    }
  }
}

/**
 * Create a new DAO client instance
 */
export function createDAOClient(config: DAOClientConfig): DAOClient {
  return new DAOClient(config);
}
