/**
 * AI Constitution DAO - Oracle Node
 *
 * Main entry point for the oracle node package.
 * Provides XRPL integration and Channel A/B oracle functionality.
 */

// Types
export * from './types';

// XRPL
export { XRPLClient, createClient, NetworkType, TransactionResult } from './xrpl/client';
export { EscrowManager, EscrowInfo } from './xrpl/escrow';
export {
  TransactionHelper,
  MEMO_TYPES,
  MemoType,
  OracleCommitment,
  OracleReveal,
  VoteData,
  ProposalData,
  encodeHex,
  decodeHex,
  parseMemo,
  buildMemoTransaction,
} from './xrpl/transactions';

// Channels
export { ChannelB, createChannelB } from './channels/channelB';

/**
 * Quick start example
 *
 * @example
 * ```typescript
 * import {
 *   createClient,
 *   EscrowManager,
 *   ChannelB,
 *   Proposal,
 *   GovernanceLayer,
 * } from '@ai-constitution-dao/oracle-node';
 *
 * async function main() {
 *   // Connect to XRPL Testnet
 *   const client = await createClient('testnet');
 *
 *   // Create and fund a wallet
 *   const wallet = client.createWallet();
 *   await client.fundWallet(wallet);
 *
 *   console.log('Wallet address:', wallet.address);
 *   console.log('Balance:', await client.getBalance());
 *
 *   // Create Channel B oracle
 *   const channelB = new ChannelB();
 *
 *   // Analyze a proposal
 *   const verdict = await channelB.analyze({
 *     logic_ast: '{"action": "transfer", "amount": 100}',
 *     text: 'Transfer 100 tokens to the community fund',
 *     layer: GovernanceLayer.L2Operational,
 *   });
 *
 *   console.log('Channel B Verdict:', verdict);
 *
 *   await client.disconnect();
 * }
 *
 * main().catch(console.error);
 * ```
 */
