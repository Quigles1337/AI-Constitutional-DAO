/**
 * Transaction utilities for AI Constitution DAO
 *
 * Helper functions for constructing and parsing XRPL transactions
 * used in the governance protocol.
 */

import { Payment, AccountSet, TrustSet } from 'xrpl';
import { XRPLClient } from './client';

/**
 * Memo types used in the protocol
 */
export const MEMO_TYPES = {
  /** Oracle commitment (commit phase) */
  ORACLE_COMMIT: 'ORACLE_COMMIT',
  /** Oracle reveal (reveal phase) */
  ORACLE_REVEAL: 'ORACLE_REVEAL',
  /** Governance vote */
  VOTE: 'VOTE',
  /** Proposal submission */
  PROPOSAL: 'PROPOSAL',
  /** State anchor (merkle root) */
  STATE_ANCHOR: 'STATE_ANCHOR',
  /** Oracle registration */
  ORACLE_REGISTER: 'ORACLE_REGISTER',
  /** Fraud proof submission */
  FRAUD_PROOF: 'FRAUD_PROOF',
} as const;

export type MemoType = typeof MEMO_TYPES[keyof typeof MEMO_TYPES];

/**
 * Encode a string to hex for memo fields
 */
export function encodeHex(str: string): string {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase();
}

/**
 * Decode hex to string from memo fields
 */
export function decodeHex(hex: string): string {
  return Buffer.from(hex, 'hex').toString('utf8');
}

/**
 * Parse memo from a transaction
 */
export function parseMemo(tx: any): { type: string; data: any } | null {
  if (!tx.Memos || tx.Memos.length === 0) {
    return null;
  }

  const memo = tx.Memos[0].Memo;
  if (!memo.MemoType || !memo.MemoData) {
    return null;
  }

  const type = decodeHex(memo.MemoType);
  const dataStr = decodeHex(memo.MemoData);

  let data: any;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }

  return { type, data };
}

/**
 * Build a memo transaction
 */
export function buildMemoTransaction(
  account: string,
  destination: string,
  memoType: MemoType,
  memoData: string | object
): Payment {
  const dataStr = typeof memoData === 'object'
    ? JSON.stringify(memoData)
    : memoData;

  return {
    TransactionType: 'Payment',
    Account: account,
    Destination: destination,
    Amount: '1', // 1 drop minimum
    Memos: [
      {
        Memo: {
          MemoType: encodeHex(memoType),
          MemoData: encodeHex(dataStr),
        },
      },
    ],
  };
}

/**
 * Oracle commitment data structure
 */
export interface OracleCommitment {
  /** Proposal ID being voted on */
  proposal_id: string;
  /** Hash of verdict + nonce */
  commitment_hash: string;
  /** Ledger index when committed */
  ledger_index: number;
}

/**
 * Oracle reveal data structure
 */
export interface OracleReveal {
  /** Proposal ID */
  proposal_id: string;
  /** The actual verdict */
  verdict: {
    channel_a?: {
      pass: boolean;
      complexity_score: number;
      paradox_found: boolean;
      cycle_found: boolean;
    };
    channel_b?: {
      semantic_alignment_score: number;
      decidability_class: string;
    };
  };
  /** Nonce used in commitment */
  nonce: string;
}

/**
 * Vote data structure
 */
export interface VoteData {
  /** Proposal ID */
  proposal_id: string;
  /** Vote choice */
  vote: 'YES' | 'NO' | 'ABSTAIN';
  /** Timestamp */
  timestamp: number;
}

/**
 * Proposal submission data structure
 */
export interface ProposalData {
  /** Canonical hash (proposal ID) */
  id: string;
  /** Proposal logic AST */
  logic_ast: string;
  /** Proposal text */
  text: string;
  /** Target governance layer */
  layer: string;
}

/**
 * Transaction helper class
 */
export class TransactionHelper {
  private client: XRPLClient;
  private daoAddress: string;

  constructor(client: XRPLClient, daoAddress: string) {
    this.client = client;
    this.daoAddress = daoAddress;
  }

  /**
   * Submit an oracle commitment
   */
  async submitCommitment(commitment: OracleCommitment): Promise<any> {
    return this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.ORACLE_COMMIT,
      commitment
    );
  }

  /**
   * Submit an oracle reveal
   */
  async submitReveal(reveal: OracleReveal): Promise<any> {
    return this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.ORACLE_REVEAL,
      reveal
    );
  }

  /**
   * Submit a vote
   */
  async submitVote(vote: VoteData): Promise<any> {
    return this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.VOTE,
      vote
    );
  }

  /**
   * Submit a proposal
   */
  async submitProposal(proposal: ProposalData): Promise<any> {
    return this.client.submitMemo(
      this.daoAddress,
      MEMO_TYPES.PROPOSAL,
      proposal
    );
  }

  /**
   * Get transactions with a specific memo type
   */
  async getTransactionsByMemoType(
    memoType: MemoType,
    account?: string
  ): Promise<any[]> {
    const targetAccount = account || this.daoAddress;

    const response = await this.client.getClient().request({
      command: 'account_tx',
      account: targetAccount,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 100,
    });

    const transactions = response.result.transactions || [];

    return transactions.filter((tx: any) => {
      const memo = parseMemo(tx.tx);
      return memo && memo.type === memoType;
    });
  }
}
