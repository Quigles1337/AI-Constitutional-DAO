/**
 * Slashing Manager
 *
 * Implements the slashing policy from spec v5.0:
 * - 15% slash for failure to reveal (after committing)
 * - 100% slash + ejection for Channel A fraud
 * - No penalty for Channel B disagreement (protects dissent)
 *
 * Slashed funds are transferred to the DAO treasury.
 */

import { createHash } from 'crypto';
import { XRPLClient, TransactionResult } from '../xrpl/client';
import { EscrowManager } from '../xrpl/escrow';
import { OracleRegistry, OracleInfo, OracleStatus } from '../network/registry';
import { ChannelAVerdict, FraudProof, CONFIG } from '../types';

/**
 * Slash event for audit trail
 */
export interface SlashEvent {
  /** Unique ID for this slash event */
  id: string;
  /** Oracle address being slashed */
  oracle_address: string;
  /** Type of slash */
  slash_type: SlashType;
  /** Amount slashed in drops */
  amount: string;
  /** Related proposal ID (if any) */
  proposal_id?: string;
  /** Unix timestamp */
  timestamp: number;
  /** Transaction hash on XRPL */
  tx_hash?: string;
  /** Whether the slash was executed on-chain */
  executed: boolean;
}

/**
 * Types of slashing events
 */
export enum SlashType {
  /** Failed to reveal after committing */
  NonReveal = 'NonReveal',
  /** Submitted fraudulent Channel A verdict */
  ChannelAFraud = 'ChannelAFraud',
  /** Oracle went offline during active epoch */
  Inactivity = 'Inactivity',
}

/**
 * Slashing configuration
 */
export interface SlashConfig {
  /** Percentage to slash for non-reveal (0.0 to 1.0) */
  non_reveal_percentage: number;
  /** Percentage to slash for fraud (should be 1.0) */
  fraud_percentage: number;
  /** Percentage to slash for inactivity (0.0 to 1.0) */
  inactivity_percentage: number;
  /** Number of missed reveals before inactivity slash */
  inactivity_threshold: number;
}

/**
 * Default slashing configuration from spec
 */
export const DEFAULT_SLASH_CONFIG: SlashConfig = {
  non_reveal_percentage: 0.15,
  fraud_percentage: 1.0,
  inactivity_percentage: 0.05,
  inactivity_threshold: 3,
};

/**
 * Slashing Manager
 *
 * Handles all slashing logic and maintains an audit trail.
 */
export class SlashingManager {
  private client: XRPLClient;
  private escrowManager: EscrowManager;
  private registry: OracleRegistry;
  private treasuryAddress: string;
  private config: SlashConfig;
  private slashHistory: Map<string, SlashEvent[]> = new Map();

  constructor(
    client: XRPLClient,
    registry: OracleRegistry,
    treasuryAddress: string,
    config: SlashConfig = DEFAULT_SLASH_CONFIG
  ) {
    this.client = client;
    this.escrowManager = new EscrowManager(client, treasuryAddress);
    this.registry = registry;
    this.treasuryAddress = treasuryAddress;
    this.config = config;
  }

  /**
   * Slash an oracle for failing to reveal
   *
   * This is called when an oracle commits but doesn't reveal
   * within the oracle window.
   */
  async slashNonReveal(
    oracleAddress: string,
    proposalId: string
  ): Promise<SlashEvent> {
    const operator = this.registry.getOperator(oracleAddress);
    if (!operator) {
      throw new Error(`Oracle ${oracleAddress} not found in registry`);
    }

    if (operator.status === OracleStatus.Ejected) {
      throw new Error(`Oracle ${oracleAddress} is already ejected`);
    }

    // Calculate slash amount
    const slashAmount = EscrowManager.calculateSlashAmount(
      operator.bond_amount,
      this.config.non_reveal_percentage
    );

    // Create slash event
    const event: SlashEvent = {
      id: this.generateSlashId(oracleAddress, proposalId),
      oracle_address: oracleAddress,
      slash_type: SlashType.NonReveal,
      amount: slashAmount,
      proposal_id: proposalId,
      timestamp: Date.now(),
      executed: false,
    };

    // Execute the slash
    try {
      // In XRPL, we can't partially cancel an escrow.
      // We need to track the slash and handle it at unbonding time,
      // or use a more complex multi-escrow system.
      // For now, we record the slash and update the operator's effective bond.

      // Record in registry (updates metrics and effective bond)
      await this.registry.slashNonReveal(oracleAddress);

      event.executed = true;
      console.log(
        `[SLASH] Non-reveal: ${oracleAddress} slashed ${slashAmount} drops ` +
        `(${(this.config.non_reveal_percentage * 100).toFixed(0)}%) for proposal ${proposalId}`
      );
    } catch (error) {
      console.error(`[SLASH] Failed to slash ${oracleAddress}:`, error);
      throw error;
    }

    // Add to history
    this.addToHistory(oracleAddress, event);

    return event;
  }

  /**
   * Slash an oracle for Channel A fraud
   *
   * This is the most severe penalty: 100% of bond + permanent ejection.
   * Called when a valid fraud proof is submitted.
   */
  async slashFraud(
    oracleAddress: string,
    fraudProof: FraudProof
  ): Promise<SlashEvent> {
    const operator = this.registry.getOperator(oracleAddress);
    if (!operator) {
      throw new Error(`Oracle ${oracleAddress} not found in registry`);
    }

    if (operator.status === OracleStatus.Ejected) {
      throw new Error(`Oracle ${oracleAddress} is already ejected`);
    }

    // Create slash event
    const event: SlashEvent = {
      id: this.generateSlashId(oracleAddress, fraudProof.proposal_id),
      oracle_address: oracleAddress,
      slash_type: SlashType.ChannelAFraud,
      amount: operator.bond_amount, // 100%
      proposal_id: fraudProof.proposal_id,
      timestamp: Date.now(),
      executed: false,
    };

    try {
      // Execute full slash via escrow cancellation
      const result = await this.registry.ejectForFraud(oracleAddress);

      event.executed = true;
      console.log(
        `[SLASH] Fraud: ${oracleAddress} EJECTED - full bond ${operator.bond_amount} drops ` +
        `slashed for proposal ${fraudProof.proposal_id}`
      );
    } catch (error) {
      console.error(`[SLASH] Failed to eject ${oracleAddress}:`, error);
      throw error;
    }

    // Add to history
    this.addToHistory(oracleAddress, event);

    return event;
  }

  /**
   * Slash an oracle for prolonged inactivity
   *
   * Called when an oracle misses too many consecutive reveals.
   */
  async slashInactivity(oracleAddress: string): Promise<SlashEvent> {
    const operator = this.registry.getOperator(oracleAddress);
    if (!operator) {
      throw new Error(`Oracle ${oracleAddress} not found in registry`);
    }

    // Check if inactivity threshold met
    if (operator.metrics.missed_reveals < this.config.inactivity_threshold) {
      throw new Error(
        `Oracle has only ${operator.metrics.missed_reveals} missed reveals, ` +
        `threshold is ${this.config.inactivity_threshold}`
      );
    }

    const slashAmount = EscrowManager.calculateSlashAmount(
      operator.bond_amount,
      this.config.inactivity_percentage
    );

    const event: SlashEvent = {
      id: this.generateSlashId(oracleAddress, 'inactivity'),
      oracle_address: oracleAddress,
      slash_type: SlashType.Inactivity,
      amount: slashAmount,
      timestamp: Date.now(),
      executed: true, // Local tracking
    };

    // Add to history
    this.addToHistory(oracleAddress, event);

    console.log(
      `[SLASH] Inactivity: ${oracleAddress} slashed ${slashAmount} drops ` +
      `(${(this.config.inactivity_percentage * 100).toFixed(0)}%)`
    );

    return event;
  }

  /**
   * Calculate pending slashes for an oracle
   *
   * Returns the total amount that will be deducted when unbonding.
   */
  calculatePendingSlashes(oracleAddress: string): string {
    const history = this.slashHistory.get(oracleAddress) || [];
    let total = BigInt(0);

    for (const event of history) {
      if (event.slash_type !== SlashType.ChannelAFraud) {
        // Fraud slashes are immediate full bond loss
        total += BigInt(event.amount);
      }
    }

    return total.toString();
  }

  /**
   * Get slash history for an oracle
   */
  getSlashHistory(oracleAddress: string): SlashEvent[] {
    return this.slashHistory.get(oracleAddress) || [];
  }

  /**
   * Get all slash events across all oracles
   */
  getAllSlashEvents(): SlashEvent[] {
    const events: SlashEvent[] = [];
    for (const history of this.slashHistory.values()) {
      events.push(...history);
    }
    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check if an oracle should be auto-ejected for accumulated slashes
   *
   * If total slashes exceed 50% of original bond, eject.
   */
  shouldAutoEject(oracleAddress: string, originalBond: string): boolean {
    const pendingSlashes = BigInt(this.calculatePendingSlashes(oracleAddress));
    const bond = BigInt(originalBond);
    return pendingSlashes > bond / BigInt(2);
  }

  /**
   * Generate a unique slash ID
   */
  private generateSlashId(oracleAddress: string, context: string): string {
    return createHash('sha256')
      .update(`${oracleAddress}:${context}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Add event to history
   */
  private addToHistory(oracleAddress: string, event: SlashEvent): void {
    const history = this.slashHistory.get(oracleAddress) || [];
    history.push(event);
    this.slashHistory.set(oracleAddress, history);
  }

  /**
   * Export state for persistence
   */
  exportState(): { history: Map<string, SlashEvent[]> } {
    return { history: this.slashHistory };
  }

  /**
   * Import state from persistence
   */
  importState(state: { history: Map<string, SlashEvent[]> }): void {
    this.slashHistory = state.history;
  }
}
