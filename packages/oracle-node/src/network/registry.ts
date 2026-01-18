/**
 * Oracle Registry
 *
 * Manages the oracle operator set according to spec v5.0:
 * - Registration with ORACLE_BOND staking
 * - Active set selection (top 101 by stake)
 * - Epoch-based rotation
 * - Unbonding with epoch delay
 * - Sybil resistance (1-operator-1-vote)
 */

import { XRPLClient } from '../xrpl/client';
import { EscrowManager } from '../xrpl/escrow';
import { OracleOperator, CONFIG } from '../types';

/**
 * Oracle registration status
 */
export enum OracleStatus {
  /** Not registered */
  Unregistered = 'Unregistered',
  /** Registered but not in active set */
  Candidate = 'Candidate',
  /** In the active oracle set */
  Active = 'Active',
  /** Initiated unbonding, waiting for epoch */
  Unbonding = 'Unbonding',
  /** Slashed and ejected */
  Ejected = 'Ejected',
}

/**
 * Extended oracle info with status
 */
export interface OracleInfo extends OracleOperator {
  status: OracleStatus;
  /** Performance metrics */
  metrics: OracleMetrics;
}

/**
 * Oracle performance metrics
 */
export interface OracleMetrics {
  /** Total proposals participated in */
  total_participations: number;
  /** Successful reveals */
  successful_reveals: number;
  /** Missed reveals (slashable) */
  missed_reveals: number;
  /** Fraud proofs against this oracle */
  fraud_proofs: number;
  /** Last active ledger */
  last_active_ledger: number;
}

/**
 * Epoch information
 */
export interface EpochInfo {
  /** Current epoch number */
  epoch_number: number;
  /** Ledger index when epoch started */
  start_ledger: number;
  /** Ledger index when epoch ends */
  end_ledger: number;
  /** Active oracle set for this epoch */
  active_set: string[];
}

/**
 * Oracle Registry Manager
 */
export class OracleRegistry {
  private client: XRPLClient;
  private escrowManager: EscrowManager;
  private operators: Map<string, OracleInfo> = new Map();
  private currentEpoch: EpochInfo | null = null;

  constructor(client: XRPLClient, treasuryAddress: string) {
    this.client = client;
    this.escrowManager = new EscrowManager(client, treasuryAddress);
  }

  /**
   * Register as an oracle operator
   *
   * Creates an escrow bond and adds to the candidate pool.
   */
  async register(bondAmount: string = CONFIG.ORACLE_BOND): Promise<OracleInfo> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    // Check if already registered
    if (this.operators.has(wallet.address)) {
      throw new Error('Already registered as oracle');
    }

    // Create escrow bond
    const { response, sequence } = await this.escrowManager.createBond(bondAmount);

    if (response.result !== 'tesSUCCESS') {
      throw new Error(`Bond creation failed: ${response.result}`);
    }

    // Create oracle info
    const oracleInfo: OracleInfo = {
      address: wallet.address,
      bond_amount: bondAmount,
      escrow_sequence: sequence,
      registered_at: Date.now(),
      active: false,
      status: OracleStatus.Candidate,
      metrics: {
        total_participations: 0,
        successful_reveals: 0,
        missed_reveals: 0,
        fraud_proofs: 0,
        last_active_ledger: 0,
      },
    };

    this.operators.set(wallet.address, oracleInfo);
    return oracleInfo;
  }

  /**
   * Initiate unbonding
   *
   * Must wait one epoch before bond can be released.
   */
  async initiateUnbond(address?: string): Promise<OracleInfo> {
    const targetAddress = address || this.client.getWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }

    const operator = this.operators.get(targetAddress);
    if (!operator) {
      throw new Error('Not registered as oracle');
    }

    if (operator.status === OracleStatus.Unbonding) {
      throw new Error('Already unbonding');
    }

    if (operator.status === OracleStatus.Ejected) {
      throw new Error('Oracle has been ejected');
    }

    // Set unbonding timestamp (must wait one epoch)
    operator.status = OracleStatus.Unbonding;
    operator.unbonding_at = Date.now();
    operator.active = false;

    return operator;
  }

  /**
   * Complete unbonding after epoch delay
   */
  async completeUnbond(address?: string): Promise<void> {
    const targetAddress = address || this.client.getWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }

    const operator = this.operators.get(targetAddress);
    if (!operator) {
      throw new Error('Not registered as oracle');
    }

    if (operator.status !== OracleStatus.Unbonding) {
      throw new Error('Not in unbonding state');
    }

    // Check if epoch has passed
    const epochDurationMs = CONFIG.ORACLE_EPOCH * 4000; // ~4s per ledger
    if (operator.unbonding_at && Date.now() - operator.unbonding_at < epochDurationMs) {
      throw new Error('Must wait one epoch to complete unbonding');
    }

    // Release escrow
    await this.escrowManager.releaseBond(targetAddress, operator.escrow_sequence);

    // Remove from registry
    this.operators.delete(targetAddress);
  }

  /**
   * Get the active oracle set
   *
   * Returns top ACTIVE_ORACLE_SET_SIZE operators by bond amount.
   */
  getActiveSet(): OracleInfo[] {
    const candidates = Array.from(this.operators.values())
      .filter(o =>
        o.status === OracleStatus.Candidate ||
        o.status === OracleStatus.Active
      )
      .sort((a, b) => {
        // Sort by bond amount descending
        const bondA = BigInt(a.bond_amount);
        const bondB = BigInt(b.bond_amount);
        return bondB > bondA ? 1 : bondB < bondA ? -1 : 0;
      });

    return candidates.slice(0, CONFIG.ACTIVE_ORACLE_SET_SIZE);
  }

  /**
   * Update the active set at epoch boundary
   */
  updateActiveSet(): string[] {
    // Mark all as candidates first
    for (const operator of this.operators.values()) {
      if (operator.status === OracleStatus.Active) {
        operator.status = OracleStatus.Candidate;
        operator.active = false;
      }
    }

    // Get new active set
    const activeSet = this.getActiveSet();

    // Mark as active
    for (const operator of activeSet) {
      operator.status = OracleStatus.Active;
      operator.active = true;
    }

    return activeSet.map(o => o.address);
  }

  /**
   * Start a new epoch
   */
  async startNewEpoch(): Promise<EpochInfo> {
    const ledgerIndex = await this.client.getLedgerIndex();

    const epochNumber = this.currentEpoch
      ? this.currentEpoch.epoch_number + 1
      : 1;

    const activeAddresses = this.updateActiveSet();

    this.currentEpoch = {
      epoch_number: epochNumber,
      start_ledger: ledgerIndex,
      end_ledger: ledgerIndex + CONFIG.ORACLE_EPOCH,
      active_set: activeAddresses,
    };

    return this.currentEpoch;
  }

  /**
   * Check if an address is in the active set
   */
  isActive(address: string): boolean {
    const operator = this.operators.get(address);
    return operator?.status === OracleStatus.Active;
  }

  /**
   * Record oracle participation
   */
  recordParticipation(address: string, revealed: boolean): void {
    const operator = this.operators.get(address);
    if (!operator) return;

    operator.metrics.total_participations++;
    if (revealed) {
      operator.metrics.successful_reveals++;
    } else {
      operator.metrics.missed_reveals++;
    }
  }

  /**
   * Record fraud proof against an oracle
   */
  recordFraudProof(address: string): void {
    const operator = this.operators.get(address);
    if (!operator) return;

    operator.metrics.fraud_proofs++;
  }

  /**
   * Slash an oracle for non-reveal
   */
  async slashNonReveal(address: string): Promise<void> {
    const operator = this.operators.get(address);
    if (!operator) {
      throw new Error('Operator not found');
    }

    const slashAmount = EscrowManager.calculateSlashAmount(
      operator.bond_amount,
      CONFIG.SLASH_NON_REVEAL
    );

    console.log(`Slashing ${address} for non-reveal: ${slashAmount} drops`);

    // Update bond amount
    operator.bond_amount = (
      BigInt(operator.bond_amount) - BigInt(slashAmount)
    ).toString();

    // Record the slash
    operator.metrics.missed_reveals++;

    // Note: In a real implementation, this would trigger an on-chain
    // escrow modification. For now, we track it locally.
  }

  /**
   * Eject an oracle for fraud
   */
  async ejectForFraud(address: string): Promise<void> {
    const operator = this.operators.get(address);
    if (!operator) {
      throw new Error('Operator not found');
    }

    // Cancel escrow (slash 100%)
    await this.escrowManager.cancelBond(address, operator.escrow_sequence);

    // Mark as ejected
    operator.status = OracleStatus.Ejected;
    operator.active = false;
    operator.bond_amount = '0';

    console.log(`Oracle ${address} ejected for fraud`);
  }

  /**
   * Get operator info
   */
  getOperator(address: string): OracleInfo | undefined {
    return this.operators.get(address);
  }

  /**
   * Get all operators
   */
  getAllOperators(): OracleInfo[] {
    return Array.from(this.operators.values());
  }

  /**
   * Get current epoch info
   */
  getCurrentEpoch(): EpochInfo | null {
    return this.currentEpoch;
  }

  /**
   * Import operator state (for persistence/sync)
   */
  importOperator(operator: OracleInfo): void {
    this.operators.set(operator.address, operator);
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    operators: OracleInfo[];
    epoch: EpochInfo | null;
  } {
    return {
      operators: Array.from(this.operators.values()),
      epoch: this.currentEpoch,
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    operators: OracleInfo[];
    epoch: EpochInfo | null;
  }): void {
    this.operators.clear();
    for (const operator of state.operators) {
      this.operators.set(operator.address, operator);
    }
    this.currentEpoch = state.epoch;
  }
}
