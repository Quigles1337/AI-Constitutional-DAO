/**
 * AI Constitution DAO - Oracle Node
 *
 * Main entry point for the oracle node package.
 * Provides XRPL integration, oracle consensus, and governance management.
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

// Network (Oracle Infrastructure)
export {
  CommitRevealProtocol,
  OracleVerdict,
  Commitment,
  Reveal,
  AggregatedVerdict,
  ProtocolPhase,
  ProposalProtocolState,
  OracleRegistry,
  OracleStatus,
  OracleInfo,
  OracleMetrics,
  EpochInfo,
} from './network';

// Governance
export {
  ProposalManager,
  ProposalState,
  VotingResults,
  JuryVerdict,
  ConstitutionalJury,
  JuryMember,
  JurySelection,
  EligibleAccount,
} from './governance';

// Staking (Token Economics)
export {
  SlashingManager,
  SlashEvent,
  SlashType,
  SlashConfig,
  DEFAULT_SLASH_CONFIG,
  FraudProofVerifier,
  FraudProofResult,
  FraudProofSubmission,
  RewardDistributor,
  OracleReward,
  EpochRewards,
  RewardConfig,
  DEFAULT_REWARD_CONFIG,
  StakingManager,
  StakingPosition,
  StakingResult,
} from './staking';
