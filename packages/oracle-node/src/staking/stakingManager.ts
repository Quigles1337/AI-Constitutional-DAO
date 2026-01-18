/**
 * Staking Manager
 *
 * High-level interface for oracle staking operations:
 * - Stake to become an oracle
 * - Increase stake for higher priority
 * - Initiate and complete unstaking
 * - View staking status and rewards
 */

import { XRPLClient, TransactionResult } from '../xrpl/client';
import { EscrowManager } from '../xrpl/escrow';
import { OracleRegistry, OracleInfo, OracleStatus } from '../network/registry';
import { SlashingManager, SlashEvent } from './slashing';
import { RewardDistributor } from './rewards';
import { CONFIG } from '../types';

/**
 * Staking position information
 */
export interface StakingPosition {
  /** Oracle address */
  address: string;
  /** Total staked amount in drops */
  staked_amount: string;
  /** Effective stake after slashing deductions */
  effective_stake: string;
  /** Current status */
  status: OracleStatus;
  /** Whether in active oracle set */
  is_active: boolean;
  /** Position in stake ranking */
  rank: number;
  /** Pending rewards */
  pending_rewards: string;
  /** Total rewards earned */
  total_rewards: string;
  /** Pending slashes */
  pending_slashes: string;
  /** Unbonding info (if applicable) */
  unbonding?: {
    initiated_at: number;
    available_at: number;
    amount: string;
  };
}

/**
 * Staking operation result
 */
export interface StakingResult {
  success: boolean;
  tx_hash?: string;
  message: string;
  position?: StakingPosition;
}

/**
 * Staking Manager
 *
 * Unified interface for all staking operations.
 */
export class StakingManager {
  private client: XRPLClient;
  private escrowManager: EscrowManager;
  private registry: OracleRegistry;
  private slashingManager: SlashingManager;
  private rewardDistributor: RewardDistributor;
  private treasuryAddress: string;

  constructor(
    client: XRPLClient,
    registry: OracleRegistry,
    slashingManager: SlashingManager,
    rewardDistributor: RewardDistributor,
    treasuryAddress: string
  ) {
    this.client = client;
    this.registry = registry;
    this.escrowManager = new EscrowManager(client, treasuryAddress);
    this.slashingManager = slashingManager;
    this.rewardDistributor = rewardDistributor;
    this.treasuryAddress = treasuryAddress;
  }

  /**
   * Stake to become an oracle
   *
   * Creates an escrow bond and registers as a candidate oracle.
   * Must stake at least ORACLE_BOND to be eligible for active set.
   */
  async stake(amount?: string): Promise<StakingResult> {
    const stakeAmount = amount || CONFIG.ORACLE_BOND;
    const wallet = this.client.getWallet();

    if (!wallet) {
      return {
        success: false,
        message: 'No wallet connected',
      };
    }

    // Check if already staked
    const existing = this.registry.getOperator(wallet.address);
    if (existing && existing.status !== OracleStatus.Unregistered) {
      return {
        success: false,
        message: `Already registered as oracle with status: ${existing.status}`,
        position: await this.getPosition(wallet.address),
      };
    }

    // Validate stake amount
    if (BigInt(stakeAmount) < BigInt(CONFIG.ORACLE_BOND)) {
      return {
        success: false,
        message: `Minimum stake is ${CONFIG.ORACLE_BOND} drops (100,000 XRP)`,
      };
    }

    try {
      // Register with the registry (creates escrow)
      const oracleInfo = await this.registry.register(stakeAmount);

      console.log(
        `[STAKE] ${wallet.address} staked ${stakeAmount} drops`
      );

      return {
        success: true,
        message: 'Successfully staked and registered as oracle candidate',
        position: await this.getPosition(wallet.address),
      };
    } catch (error) {
      return {
        success: false,
        message: `Staking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Increase stake
   *
   * Adds more stake to improve ranking for active set selection.
   */
  async increaseStake(additionalAmount: string): Promise<StakingResult> {
    const wallet = this.client.getWallet();

    if (!wallet) {
      return {
        success: false,
        message: 'No wallet connected',
      };
    }

    const existing = this.registry.getOperator(wallet.address);
    if (!existing) {
      return {
        success: false,
        message: 'Not registered as oracle. Call stake() first.',
      };
    }

    if (existing.status === OracleStatus.Ejected) {
      return {
        success: false,
        message: 'Oracle has been ejected and cannot increase stake',
      };
    }

    if (existing.status === OracleStatus.Unbonding) {
      return {
        success: false,
        message: 'Cannot increase stake while unbonding',
      };
    }

    try {
      // Create additional escrow bond
      const { response, sequence } = await this.escrowManager.createBond(
        additionalAmount
      );

      if (response.result !== 'tesSUCCESS') {
        return {
          success: false,
          message: `Failed to create additional bond: ${response.result}`,
        };
      }

      // Update registry (in production, would track multiple escrows)
      // For now, we just update the bond amount
      existing.bond_amount = (
        BigInt(existing.bond_amount) + BigInt(additionalAmount)
      ).toString();

      console.log(
        `[STAKE] ${wallet.address} increased stake by ${additionalAmount} drops`
      );

      return {
        success: true,
        tx_hash: response.hash,
        message: `Successfully increased stake by ${additionalAmount} drops`,
        position: await this.getPosition(wallet.address),
      };
    } catch (error) {
      return {
        success: false,
        message: `Increase stake failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Initiate unstaking
   *
   * Starts the unbonding period. Must wait one epoch before
   * completing unstake.
   */
  async initiateUnstake(): Promise<StakingResult> {
    const wallet = this.client.getWallet();

    if (!wallet) {
      return {
        success: false,
        message: 'No wallet connected',
      };
    }

    try {
      const operator = await this.registry.initiateUnbond(wallet.address);

      const epochDurationMs = CONFIG.ORACLE_EPOCH * 4000;
      const availableAt = Date.now() + epochDurationMs;

      console.log(
        `[STAKE] ${wallet.address} initiated unstaking, available at ${new Date(availableAt).toISOString()}`
      );

      return {
        success: true,
        message: 'Unstaking initiated. Must wait one epoch to complete.',
        position: await this.getPosition(wallet.address),
      };
    } catch (error) {
      return {
        success: false,
        message: `Unstaking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Complete unstaking
   *
   * Releases the escrow and returns funds after unbonding period.
   * Deducts any pending slashes.
   */
  async completeUnstake(): Promise<StakingResult> {
    const wallet = this.client.getWallet();

    if (!wallet) {
      return {
        success: false,
        message: 'No wallet connected',
      };
    }

    const operator = this.registry.getOperator(wallet.address);
    if (!operator) {
      return {
        success: false,
        message: 'Not registered as oracle',
      };
    }

    // Calculate any pending slashes to deduct
    const pendingSlashes = this.slashingManager.calculatePendingSlashes(
      wallet.address
    );

    const effectiveReturn = (
      BigInt(operator.bond_amount) - BigInt(pendingSlashes)
    ).toString();

    try {
      await this.registry.completeUnbond(wallet.address);

      console.log(
        `[STAKE] ${wallet.address} completed unstaking, returning ${effectiveReturn} drops`
      );

      return {
        success: true,
        message: `Unstaking complete. Returned ${effectiveReturn} drops (after ${pendingSlashes} drops in slashes).`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Complete unstake failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Claim pending rewards
   */
  async claimRewards(): Promise<StakingResult> {
    const wallet = this.client.getWallet();

    if (!wallet) {
      return {
        success: false,
        message: 'No wallet connected',
      };
    }

    try {
      const { amount, tx_hash } = await this.rewardDistributor.claimRewards(
        wallet.address
      );

      return {
        success: true,
        tx_hash,
        message: `Claimed ${amount} drops in rewards`,
        position: await this.getPosition(wallet.address),
      };
    } catch (error) {
      return {
        success: false,
        message: `Claim rewards failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get staking position for an address
   */
  async getPosition(address?: string): Promise<StakingPosition | null> {
    const targetAddress = address || this.client.getWallet()?.address;
    if (!targetAddress) {
      return null;
    }

    const operator = this.registry.getOperator(targetAddress);
    if (!operator) {
      return null;
    }

    // Calculate effective stake (after slashing)
    const pendingSlashes = this.slashingManager.calculatePendingSlashes(
      targetAddress
    );
    const effectiveStake = (
      BigInt(operator.bond_amount) - BigInt(pendingSlashes)
    ).toString();

    // Get ranking
    const activeSet = this.registry.getActiveSet();
    const allOperators = this.registry.getAllOperators()
      .sort((a, b) => {
        const bondA = BigInt(a.bond_amount);
        const bondB = BigInt(b.bond_amount);
        return bondB > bondA ? 1 : bondB < bondA ? -1 : 0;
      });
    const rank = allOperators.findIndex(o => o.address === targetAddress) + 1;

    // Get rewards
    const pendingRewards = this.rewardDistributor.getPendingRewards(targetAddress);
    const totalRewards = this.rewardDistributor.getTotalRewardsEarned(targetAddress);

    // Build position
    const position: StakingPosition = {
      address: targetAddress,
      staked_amount: operator.bond_amount,
      effective_stake: effectiveStake,
      status: operator.status,
      is_active: operator.status === OracleStatus.Active,
      rank,
      pending_rewards: pendingRewards,
      total_rewards: totalRewards,
      pending_slashes: pendingSlashes,
    };

    // Add unbonding info if applicable
    if (operator.status === OracleStatus.Unbonding && operator.unbonding_at) {
      const epochDurationMs = CONFIG.ORACLE_EPOCH * 4000;
      position.unbonding = {
        initiated_at: operator.unbonding_at,
        available_at: operator.unbonding_at + epochDurationMs,
        amount: effectiveStake,
      };
    }

    return position;
  }

  /**
   * Get active set with positions
   */
  async getActiveSet(): Promise<StakingPosition[]> {
    const activeOracles = this.registry.getActiveSet();
    const positions: StakingPosition[] = [];

    for (const oracle of activeOracles) {
      const position = await this.getPosition(oracle.address);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Get staking statistics
   */
  getStatistics(): {
    total_staked: string;
    active_oracles: number;
    candidate_oracles: number;
    minimum_stake_for_active: string;
    reward_stats: ReturnType<RewardDistributor['getStatistics']>;
  } {
    const operators = this.registry.getAllOperators();
    const active = operators.filter(o => o.status === OracleStatus.Active);
    const candidates = operators.filter(o => o.status === OracleStatus.Candidate);

    const totalStaked = operators.reduce(
      (sum, o) => sum + BigInt(o.bond_amount),
      BigInt(0)
    );

    // Get minimum stake in active set
    const activeSet = this.registry.getActiveSet();
    const minActiveStake = activeSet.length > 0
      ? activeSet.reduce((min, o) =>
          BigInt(o.bond_amount) < BigInt(min) ? o.bond_amount : min,
          activeSet[0].bond_amount
        )
      : CONFIG.ORACLE_BOND;

    return {
      total_staked: totalStaked.toString(),
      active_oracles: active.length,
      candidate_oracles: candidates.length,
      minimum_stake_for_active: minActiveStake,
      reward_stats: this.rewardDistributor.getStatistics(),
    };
  }
}
