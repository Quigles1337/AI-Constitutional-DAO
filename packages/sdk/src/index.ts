/**
 * AI Constitution DAO SDK
 *
 * Client SDK for interacting with the AI Constitution DAO governance system
 * built on XRPL.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { DAOClient, ProposalBuilder, GovernanceLayer, Vote } from '@ai-constitution-dao/sdk';
 *
 * // Create and connect client
 * const client = new DAOClient({
 *   network: 'testnet',
 *   walletSeed: 'sEdxxxxxxx',
 * });
 * await client.connect();
 *
 * // Submit a proposal using the builder
 * const proposal = await client.submitProposal(
 *   new ProposalBuilder()
 *     .setText('Increase oracle rewards by 10%')
 *     .setLayer(GovernanceLayer.L2Operational)
 *     .addParameterChange('oracle_rewards', 1.1)
 *     .build()
 * );
 *
 * // Vote on a proposal
 * await client.vote(proposal.proposal.id, Vote.Yes);
 *
 * // Get oracle network health
 * const oracles = client.getAllOracles();
 * const health = OracleUtils.calculateNetworkHealth(oracles);
 * console.log(`Network health: ${health.healthPercent}%`);
 *
 * await client.disconnect();
 * ```
 */

// Client
export {
  DAOClient,
  DAOClientConfig,
  DAOClientEvents,
  createDAOClient,
} from './client';

// Proposal utilities
export {
  ProposalBuilder,
  ProposalTemplates,
  ProposalUtils,
} from './proposal';

// Oracle utilities
export {
  OracleAnalytics,
  NetworkHealth,
  OracleUtils,
  OracleMonitor,
} from './oracle';

// Re-export commonly used types from oracle-node
export {
  // Types
  ProposalInput,
  Proposal,
  ProposalStatus,
  GovernanceLayer,
  DecidabilityClass,
  Vote,
  FrictionParams,
  ChannelAVerdict,
  ChannelBVerdict,

  // Oracle types
  OracleStatus,
  OracleInfo,
  OracleMetrics,
  StakingPosition,

  // Governance types
  GovernanceProposal,
  GovernancePhase,
  GovernanceEvent,
  VotingTally,

  // Config
  CONFIG,
  calculateFriction,
} from '@ai-constitution-dao/oracle-node';
