/**
 * Escrow Manager for Oracle Bonding
 *
 * Uses XRPL native escrow for oracle bond management:
 * - Create escrow for oracle registration (bonding)
 * - Release escrow for successful unbonding
 * - Cancel escrow for slashing (returns to DAO treasury)
 */

import {
  EscrowCreate,
  EscrowFinish,
  EscrowCancel,
  rippleTimeToUnixTime,
  unixTimeToRippleTime,
} from 'xrpl';
import { XRPLClient, TransactionResult } from './client';

/**
 * Escrow information
 */
export interface EscrowInfo {
  /** The account that created the escrow */
  account: string;
  /** The destination account */
  destination: string;
  /** Amount in drops */
  amount: string;
  /** Sequence number of the escrow */
  sequence: number;
  /** Unix timestamp when escrow can be finished (if time-based) */
  finishAfter?: number;
  /** Unix timestamp when escrow can be cancelled (if time-based) */
  cancelAfter?: number;
  /** Crypto condition (if condition-based) */
  condition?: string;
}

/**
 * Escrow Manager for oracle bonding on XRPL
 */
export class EscrowManager {
  private client: XRPLClient;
  private treasuryAddress: string;

  constructor(client: XRPLClient, treasuryAddress: string) {
    this.client = client;
    this.treasuryAddress = treasuryAddress;
  }

  /**
   * Create an escrow for oracle bonding
   *
   * The escrow is created with the oracle's bond amount and can be:
   * - Finished after a successful unbonding period
   * - Cancelled (slashed) for misbehavior
   *
   * @param amount Bond amount in drops
   * @param unbondingPeriod Seconds until the escrow can be finished (default: 2 weeks)
   * @returns Transaction response and escrow sequence
   */
  async createBond(
    amount: string,
    unbondingPeriod: number = 14 * 24 * 60 * 60 // 2 weeks
  ): Promise<{ response: TransactionResult; sequence: number }> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    // Get current account info for sequence number
    const accountInfo = await this.client.getAccountInfo();
    const sequence = accountInfo.account_data.Sequence;

    // Calculate finish time (current time + unbonding period)
    const now = Math.floor(Date.now() / 1000);
    const finishAfter = unixTimeToRippleTime(now + unbondingPeriod);

    // Create escrow that can be finished by the owner after unbonding period
    // or cancelled (slashed) by the treasury at any time
    const tx: EscrowCreate = {
      TransactionType: 'EscrowCreate',
      Account: wallet.address,
      Destination: wallet.address, // Self-escrow for bonding
      Amount: amount,
      FinishAfter: finishAfter,
      // CancelAfter could be set for maximum bond duration
    };

    const response = await this.client.submitAnyTransaction(tx);

    return {
      response,
      sequence,
    };
  }

  /**
   * Create an escrow with a crypto-condition
   *
   * Used for more complex bonding scenarios where release
   * requires cryptographic proof.
   *
   * @param amount Bond amount in drops
   * @param condition PREIMAGE-SHA-256 crypto-condition (hex)
   * @param cancelAfter Seconds until escrow can be cancelled
   */
  async createConditionalBond(
    amount: string,
    condition: string,
    cancelAfter: number = 30 * 24 * 60 * 60 // 30 days
  ): Promise<{ response: TransactionResult; sequence: number }> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    const accountInfo = await this.client.getAccountInfo();
    const sequence = accountInfo.account_data.Sequence;

    const now = Math.floor(Date.now() / 1000);
    const cancelTime = unixTimeToRippleTime(now + cancelAfter);

    const tx: EscrowCreate = {
      TransactionType: 'EscrowCreate',
      Account: wallet.address,
      Destination: this.treasuryAddress,
      Amount: amount,
      Condition: condition,
      CancelAfter: cancelTime,
    };

    const response = await this.client.submitAnyTransaction(tx);

    return {
      response,
      sequence,
    };
  }

  /**
   * Release an escrow (successful unbonding)
   *
   * Can only be called after FinishAfter time has passed.
   *
   * @param owner The account that created the escrow
   * @param escrowSequence The sequence number of the escrow
   * @param fulfillment Optional fulfillment for conditional escrows
   */
  async releaseBond(
    owner: string,
    escrowSequence: number,
    fulfillment?: string
  ): Promise<TransactionResult> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    const tx: EscrowFinish = {
      TransactionType: 'EscrowFinish',
      Account: wallet.address,
      Owner: owner,
      OfferSequence: escrowSequence,
    };

    if (fulfillment) {
      tx.Fulfillment = fulfillment;
    }

    return this.client.submitAnyTransaction(tx);
  }

  /**
   * Cancel an escrow (slashing)
   *
   * Used when an oracle misbehaves. The escrowed funds go to
   * the destination (treasury) instead of being returned.
   *
   * Note: This can only be called after CancelAfter time,
   * OR if there's a protocol-level slashing mechanism.
   *
   * @param owner The account that created the escrow
   * @param escrowSequence The sequence number of the escrow
   */
  async cancelBond(
    owner: string,
    escrowSequence: number
  ): Promise<TransactionResult> {
    const wallet = this.client.getWallet();
    if (!wallet) {
      throw new Error('No wallet set');
    }

    const tx: EscrowCancel = {
      TransactionType: 'EscrowCancel',
      Account: wallet.address,
      Owner: owner,
      OfferSequence: escrowSequence,
    };

    return this.client.submitAnyTransaction(tx);
  }

  /**
   * Get escrow objects for an account
   */
  async getEscrows(address?: string): Promise<any[]> {
    const targetAddress = address || this.client.getWallet()?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }

    const response = await this.client.getClient().request({
      command: 'account_objects',
      account: targetAddress,
      type: 'escrow',
      ledger_index: 'validated',
    });

    return response.result.account_objects;
  }

  /**
   * Calculate partial slash amount
   *
   * @param bondAmount Total bond amount in drops
   * @param slashPercentage Percentage to slash (0.0 to 1.0)
   */
  static calculateSlashAmount(bondAmount: string, slashPercentage: number): string {
    const amount = BigInt(bondAmount);
    const slashBps = BigInt(Math.floor(slashPercentage * 10000));
    const slashAmount = (amount * slashBps) / BigInt(10000);
    return slashAmount.toString();
  }

  /**
   * Convert Ripple epoch time to Unix timestamp
   */
  static rippleTimeToUnix(rippleTime: number): number {
    return rippleTimeToUnixTime(rippleTime);
  }

  /**
   * Convert Unix timestamp to Ripple epoch time
   */
  static unixTimeToRipple(unixTime: number): number {
    return unixTimeToRippleTime(unixTime);
  }
}
