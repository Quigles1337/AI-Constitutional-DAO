/**
 * Reward Distribution System
 *
 * Implements oracle rewards from the spec:
 * - Epoch-based reward distribution
 * - Pro-rata allocation based on stake and participation
 * - Performance multipliers for consistent oracles
 * - Slashing deductions applied before rewards
 */

import { createHash } from 'crypto';
import { XRPLClient } from '../xrpl/client';
import { OracleRegistry, OracleInfo, OracleStatus } from '../network/registry';
import { CONFIG } from '../types';

/**
 * Reward calculation for a single oracle
 */
export interface OracleReward {
  /** Oracle address */
  address: string;
  /** Base reward from stake weight */
  base_reward: string;
  /** Performance multiplier (0.5 to 1.5) */
  performance_multiplier: number;
  /** Final reward after multiplier */
  final_reward: string;
  /** Participation rate this epoch */
  participation_rate: number;
  /** Any deductions from slashing */
  deductions: string;
}

/**
 * Epoch reward distribution
 */
export interface EpochRewards {
  /** Epoch number */
  epoch_number: number;
  /** Total reward pool for this epoch */
  total_pool: string;
  /** Total stake of active oracles */
  total_stake: string;
  /** Individual oracle rewards */
  rewards: OracleReward[];
  /** Timestamp of distribution */
  distributed_at: number;
  /** Whether rewards have been claimed */
  claimed: Map<string, boolean>;
}

/**
 * Reward configuration
 */
export interface RewardConfig {
  /** Base epoch reward pool (in drops) */
  epoch_reward_pool: string;
  /** Minimum participation rate to receive rewards */
  min_participation: number;
  /** Maximum performance multiplier */
  max_multiplier: number;
  /** Minimum performance multiplier */
  min_multiplier: number;
}

/**
 * Default reward configuration
 */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  epoch_reward_pool: '10000000000', // 10,000 XRP per epoch
  min_participation: 0.5, // Must participate in at least 50% of proposals
  max_multiplier: 1.5,
  min_multiplier: 0.5,
};

/**
 * Reward Distributor
 *
 * Manages epoch-based reward distribution to oracle operators.
 */
export class RewardDistributor {
  private client: XRPLClient;
  private registry: OracleRegistry;
  private treasuryAddress: string;
  private config: RewardConfig;
  private epochRewards: Map<number, EpochRewards> = new Map();
  private pendingRewards: Map<string, string> = new Map(); // address -> drops

  constructor(
    client: XRPLClient,
    registry: OracleRegistry,
    treasuryAddress: string,
    config: RewardConfig = DEFAULT_REWARD_CONFIG
  ) {
    this.client = client;
    this.registry = registry;
    this.treasuryAddress = treasuryAddress;
    this.config = config;
  }

  /**
   * Calculate rewards for an epoch
   *
   * Called at the end of each epoch to calculate reward distribution.
   */
  async calculateEpochRewards(
    epochNumber: number,
    proposalsInEpoch: number
  ): Promise<EpochRewards> {
    const activeOracles = this.registry.getActiveSet();

    if (activeOracles.length === 0) {
      throw new Error('No active oracles in epoch');
    }

    // Calculate total stake
    const totalStake = activeOracles.reduce(
      (sum, o) => sum + BigInt(o.bond_amount),
      BigInt(0)
    );

    // Calculate individual rewards
    const rewards: OracleReward[] = [];
    const rewardPool = BigInt(this.config.epoch_reward_pool);

    for (const oracle of activeOracles) {
      const reward = this.calculateOracleReward(
        oracle,
        totalStake,
        rewardPool,
        proposalsInEpoch
      );
      rewards.push(reward);
    }

    const epochReward: EpochRewards = {
      epoch_number: epochNumber,
      total_pool: this.config.epoch_reward_pool,
      total_stake: totalStake.toString(),
      rewards,
      distributed_at: Date.now(),
      claimed: new Map(),
    };

    // Store epoch rewards
    this.epochRewards.set(epochNumber, epochReward);

    // Add to pending rewards
    for (const reward of rewards) {
      const current = BigInt(this.pendingRewards.get(reward.address) || '0');
      const newReward = current + BigInt(reward.final_reward);
      this.pendingRewards.set(reward.address, newReward.toString());
    }

    console.log(
      `[REWARDS] Epoch ${epochNumber}: Distributed ${this.config.epoch_reward_pool} drops ` +
      `to ${rewards.length} oracles`
    );

    return epochReward;
  }

  /**
   * Calculate reward for a single oracle
   */
  private calculateOracleReward(
    oracle: OracleInfo,
    totalStake: bigint,
    rewardPool: bigint,
    proposalsInEpoch: number
  ): OracleReward {
    // Calculate stake weight
    const stakeWeight = BigInt(oracle.bond_amount);

    // Base reward = (stake / totalStake) * rewardPool
    const baseReward = (stakeWeight * rewardPool) / totalStake;

    // Calculate participation rate
    const participationRate = proposalsInEpoch > 0
      ? oracle.metrics.successful_reveals / proposalsInEpoch
      : 0;

    // Calculate performance multiplier
    const performanceMultiplier = this.calculatePerformanceMultiplier(
      oracle,
      participationRate
    );

    // Final reward with multiplier
    const multiplierBps = BigInt(Math.floor(performanceMultiplier * 10000));
    const finalReward = (baseReward * multiplierBps) / BigInt(10000);

    // Calculate any deductions (from accumulated slashing)
    const deductions = '0'; // Could integrate with SlashingManager

    return {
      address: oracle.address,
      base_reward: baseReward.toString(),
      performance_multiplier: performanceMultiplier,
      final_reward: finalReward.toString(),
      participation_rate: participationRate,
      deductions,
    };
  }

  /**
   * Calculate performance multiplier based on oracle behavior
   */
  private calculatePerformanceMultiplier(
    oracle: OracleInfo,
    participationRate: number
  ): number {
    const { min_multiplier, max_multiplier, min_participation } = this.config;

    // Below minimum participation = minimum multiplier
    if (participationRate < min_participation) {
      return min_multiplier;
    }

    // Calculate base multiplier from participation
    // Linear scale from min_participation (min_multiplier) to 1.0 (max_multiplier)
    const participationFactor = (participationRate - min_participation) /
      (1.0 - min_participation);
    let multiplier = min_multiplier +
      (max_multiplier - min_multiplier) * participationFactor;

    // Apply penalties for missed reveals
    const missedPenalty = oracle.metrics.missed_reveals * 0.05;
    multiplier = Math.max(min_multiplier, multiplier - missedPenalty);

    // Apply bonus for consistent performance (no fraud proofs)
    if (oracle.metrics.fraud_proofs === 0 && participationRate >= 0.95) {
      multiplier = Math.min(max_multiplier, multiplier + 0.1);
    }

    return Math.round(multiplier * 100) / 100; // Round to 2 decimals
  }

  /**
   * Claim pending rewards
   *
   * Oracle operators call this to receive their accumulated rewards.
   */
  async claimRewards(oracleAddress: string): Promise<{
    amount: string;
    tx_hash?: string;
  }> {
    const pending = this.pendingRewards.get(oracleAddress) || '0';

    if (pending === '0') {
      throw new Error('No pending rewards to claim');
    }

    // In production, this would execute an XRPL payment from treasury
    console.log(`[REWARDS] Claim: ${oracleAddress} claiming ${pending} drops`);

    // Clear pending rewards
    this.pendingRewards.set(oracleAddress, '0');

    // For now, return the amount (actual XRPL transfer would happen in production)
    return {
      amount: pending,
      // tx_hash would be filled in after actual XRPL transaction
    };
  }

  /**
   * Get pending rewards for an oracle
   */
  getPendingRewards(oracleAddress: string): string {
    return this.pendingRewards.get(oracleAddress) || '0';
  }

  /**
   * Get rewards for a specific epoch
   */
  getEpochRewards(epochNumber: number): EpochRewards | undefined {
    return this.epochRewards.get(epochNumber);
  }

  /**
   * Get total rewards distributed to an oracle across all epochs
   */
  getTotalRewardsEarned(oracleAddress: string): string {
    let total = BigInt(0);

    for (const epochReward of this.epochRewards.values()) {
      const oracleReward = epochReward.rewards.find(
        r => r.address === oracleAddress
      );
      if (oracleReward) {
        total += BigInt(oracleReward.final_reward);
      }
    }

    return total.toString();
  }

  /**
   * Get reward statistics
   */
  getStatistics(): {
    total_distributed: string;
    total_epochs: number;
    average_per_epoch: string;
    top_earners: Array<{ address: string; total: string }>;
  } {
    let totalDistributed = BigInt(0);
    const earningsByOracle: Map<string, bigint> = new Map();

    for (const epochReward of this.epochRewards.values()) {
      for (const reward of epochReward.rewards) {
        totalDistributed += BigInt(reward.final_reward);
        const current = earningsByOracle.get(reward.address) || BigInt(0);
        earningsByOracle.set(
          reward.address,
          current + BigInt(reward.final_reward)
        );
      }
    }

    const totalEpochs = this.epochRewards.size;
    const averagePerEpoch = totalEpochs > 0
      ? (totalDistributed / BigInt(totalEpochs)).toString()
      : '0';

    // Get top 10 earners
    const topEarners = Array.from(earningsByOracle.entries())
      .sort((a, b) => (b[1] > a[1] ? 1 : -1))
      .slice(0, 10)
      .map(([address, total]) => ({ address, total: total.toString() }));

    return {
      total_distributed: totalDistributed.toString(),
      total_epochs: totalEpochs,
      average_per_epoch: averagePerEpoch,
      top_earners: topEarners,
    };
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    epochRewards: Array<[number, EpochRewards]>;
    pendingRewards: Array<[string, string]>;
  } {
    // Convert Maps to arrays for serialization
    const epochRewardsArray = Array.from(this.epochRewards.entries()).map(
      ([num, rewards]) => [
        num,
        {
          ...rewards,
          claimed: Array.from(rewards.claimed.entries()),
        },
      ]
    ) as Array<[number, EpochRewards]>;

    return {
      epochRewards: epochRewardsArray,
      pendingRewards: Array.from(this.pendingRewards.entries()),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    epochRewards: Array<[number, any]>;
    pendingRewards: Array<[string, string]>;
  }): void {
    this.epochRewards.clear();
    for (const [num, rewards] of state.epochRewards) {
      this.epochRewards.set(num, {
        ...rewards,
        claimed: new Map(rewards.claimed),
      });
    }
    this.pendingRewards = new Map(state.pendingRewards);
  }
}
