/**
 * AI Constitution DAO SDK - Oracle Helpers
 *
 * Utilities for oracle operations and monitoring.
 */

import {
  OracleInfo,
  OracleStatus,
  OracleMetrics,
  StakingPosition,
  CONFIG,
} from '@ai-constitution-dao/oracle-node';

/**
 * Oracle position analytics
 */
export interface OracleAnalytics {
  /** Current position in the ranking */
  rank: number;
  /** Whether in the active set (top 101) */
  isActive: boolean;
  /** Stake amount in XRP */
  stakeXRP: number;
  /** Effective stake after slashes */
  effectiveStakeXRP: number;
  /** Performance score (0-100) */
  performanceScore: number;
  /** Estimated epoch rewards in XRP */
  estimatedRewardsXRP: number;
  /** Risk level based on performance */
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Network health metrics
 */
export interface NetworkHealth {
  /** Total number of registered oracles */
  totalOracles: number;
  /** Number of active oracles */
  activeOracles: number;
  /** Total stake in XRP */
  totalStakeXRP: number;
  /** Average performance score */
  averagePerformance: number;
  /** Network health status */
  status: 'healthy' | 'degraded' | 'critical';
  /** Health percentage (0-100) */
  healthPercent: number;
}

/**
 * Oracle utility functions
 */
export const OracleUtils = {
  /**
   * Analyze an oracle position
   */
  analyzePosition(position: StakingPosition): OracleAnalytics {
    const stakeXRP = parseInt(position.staked_amount) / 1_000_000;
    const effectiveXRP = parseInt(position.effective_stake) / 1_000_000;
    const pendingSlashXRP = parseInt(position.pending_slashes) / 1_000_000;

    // Calculate performance score
    const successRate =
      position.metrics.successful_reveals /
      Math.max(1, position.metrics.successful_reveals + position.metrics.missed_reveals);
    const performanceScore = Math.round(successRate * 100);

    // Estimate rewards (simplified - assumes equal distribution among active set)
    const epochRewardPool = 10000; // 10k XRP per epoch (example)
    const estimatedRewardsXRP = position.is_active
      ? (epochRewardPool / CONFIG.ACTIVE_ORACLE_SET_SIZE) * (performanceScore / 100)
      : 0;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (performanceScore < 90) riskLevel = 'medium';
    if (performanceScore < 75 || pendingSlashXRP > 0) riskLevel = 'high';

    return {
      rank: position.rank,
      isActive: position.is_active,
      stakeXRP,
      effectiveStakeXRP: effectiveXRP,
      performanceScore,
      estimatedRewardsXRP,
      riskLevel,
    };
  },

  /**
   * Calculate network health metrics
   */
  calculateNetworkHealth(oracles: OracleInfo[]): NetworkHealth {
    const activeOracles = oracles.filter(o => o.status === OracleStatus.Active);
    const totalStakeDrops = oracles.reduce(
      (sum, o) => sum + BigInt(o.bond_amount),
      BigInt(0)
    );

    // Calculate average performance
    const performances = oracles.map(o => {
      const total = o.metrics.successful_reveals + o.metrics.missed_reveals;
      return total > 0 ? o.metrics.successful_reveals / total : 0;
    });
    const avgPerformance =
      performances.reduce((a, b) => a + b, 0) / Math.max(1, performances.length);

    // Calculate health percentage
    const activeRatio = activeOracles.length / CONFIG.ACTIVE_ORACLE_SET_SIZE;
    const healthPercent = Math.min(100, Math.round(activeRatio * 100 * avgPerformance));

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (activeOracles.length < CONFIG.ACTIVE_ORACLE_SET_SIZE * 0.67) {
      status = 'degraded';
    }
    if (activeOracles.length < CONFIG.ACTIVE_ORACLE_SET_SIZE * 0.33) {
      status = 'critical';
    }

    return {
      totalOracles: oracles.length,
      activeOracles: activeOracles.length,
      totalStakeXRP: Number(totalStakeDrops) / 1_000_000,
      averagePerformance: Math.round(avgPerformance * 100),
      status,
      healthPercent,
    };
  },

  /**
   * Calculate minimum stake required to enter active set
   */
  calculateMinimumStake(oracles: OracleInfo[]): string {
    if (oracles.length < CONFIG.ACTIVE_ORACLE_SET_SIZE) {
      return CONFIG.ORACLE_BOND;
    }

    // Sort by bond amount descending
    const sorted = [...oracles].sort(
      (a, b) => Number(BigInt(b.bond_amount) - BigInt(a.bond_amount))
    );

    // Get the 101st oracle's stake
    const threshold = sorted[CONFIG.ACTIVE_ORACLE_SET_SIZE - 1];
    const minRequired = BigInt(threshold.bond_amount) + BigInt(1_000_000); // +1 XRP
    return minRequired.toString();
  },

  /**
   * Format oracle status for display
   */
  formatStatus(status: OracleStatus): string {
    const statusMap: Record<OracleStatus, string> = {
      [OracleStatus.Active]: 'Active',
      [OracleStatus.Candidate]: 'Candidate',
      [OracleStatus.Unbonding]: 'Unbonding',
      [OracleStatus.Ejected]: 'Ejected',
      [OracleStatus.Unregistered]: 'Unregistered',
    };
    return statusMap[status] || status;
  },

  /**
   * Check if address can become an oracle
   */
  canRegister(balance: string): { canRegister: boolean; reason?: string } {
    const balanceDrops = BigInt(balance) * BigInt(1_000_000); // Assuming balance is in XRP
    const bondRequired = BigInt(CONFIG.ORACLE_BOND);

    if (balanceDrops < bondRequired) {
      return {
        canRegister: false,
        reason: `Insufficient balance. Need ${Number(bondRequired) / 1_000_000} XRP, have ${balance} XRP`,
      };
    }

    return { canRegister: true };
  },

  /**
   * Calculate unbonding completion time
   */
  getUnbondingEndTime(position: StakingPosition): Date | null {
    if (!position.unbonding) {
      return null;
    }
    return new Date(position.unbonding.available_at);
  },

  /**
   * Format XRP amount
   */
  formatXRP(drops: string | number): string {
    const xrp = Number(drops) / 1_000_000;
    if (xrp >= 1_000_000) {
      return `${(xrp / 1_000_000).toFixed(2)}M XRP`;
    } else if (xrp >= 1_000) {
      return `${(xrp / 1_000).toFixed(2)}k XRP`;
    }
    return `${xrp.toFixed(2)} XRP`;
  },
};

/**
 * Oracle performance monitor
 */
export class OracleMonitor {
  private positions: Map<string, StakingPosition[]> = new Map();

  /**
   * Record a position snapshot for an oracle
   */
  recordSnapshot(address: string, position: StakingPosition): void {
    const history = this.positions.get(address) || [];
    history.push({ ...position });
    // Keep last 100 snapshots
    if (history.length > 100) {
      history.shift();
    }
    this.positions.set(address, history);
  }

  /**
   * Get performance trend for an oracle
   */
  getPerformanceTrend(address: string): 'improving' | 'stable' | 'declining' {
    const history = this.positions.get(address);
    if (!history || history.length < 2) {
      return 'stable';
    }

    const recent = history.slice(-10);
    const performances = recent.map(p => {
      const total = p.metrics.successful_reveals + p.metrics.missed_reveals;
      return total > 0 ? p.metrics.successful_reveals / total : 1;
    });

    const firstHalf = performances.slice(0, Math.floor(performances.length / 2));
    const secondHalf = performances.slice(Math.floor(performances.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 0.05) return 'improving';
    if (secondAvg < firstAvg - 0.05) return 'declining';
    return 'stable';
  }

  /**
   * Get position history for an oracle
   */
  getHistory(address: string): StakingPosition[] {
    return this.positions.get(address) || [];
  }
}
