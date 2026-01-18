/**
 * Staking module exports
 *
 * Token economics for oracle bonding, slashing, and rewards.
 */

export {
  SlashingManager,
  SlashEvent,
  SlashType,
  SlashConfig,
  DEFAULT_SLASH_CONFIG,
} from './slashing';

export {
  FraudProofVerifier,
  FraudProofResult,
  FraudProofSubmission,
} from './fraudProof';

export {
  RewardDistributor,
  OracleReward,
  EpochRewards,
  RewardConfig,
  DEFAULT_REWARD_CONFIG,
} from './rewards';

export {
  StakingManager,
  StakingPosition,
  StakingResult,
} from './stakingManager';
