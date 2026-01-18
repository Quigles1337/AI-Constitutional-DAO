/**
 * Integration Test: Token Economics Flow (Local Simulation)
 *
 * Demonstrates the staking, slashing, and reward mechanics:
 * 1. Oracle registration and staking
 * 2. Active set selection
 * 3. Reward distribution
 * 4. Slashing for non-reveal
 * 5. Fraud proof and ejection
 *
 * Run with: npx ts-node src/test-staking-flow.ts
 */

import { createHash } from 'crypto';
import { OracleRegistry, OracleStatus } from './network/registry';
import {
  SlashingManager,
  FraudProofVerifier,
  RewardDistributor,
  StakingManager,
  SlashType,
} from './staking';
import { ChannelAVerdict, CONFIG } from './types';

// Mock XRPL Client for local testing
class MockXRPLClient {
  private currentWallet: { address: string } | null = null;
  private wallets: Map<string, { address: string }> = new Map();

  setWallet(address: string) {
    this.currentWallet = { address };
    this.wallets.set(address, this.currentWallet);
  }

  getWallet() {
    return this.currentWallet;
  }

  async getLedgerIndex() {
    return 12345678;
  }

  async getAccountInfo() {
    return { account_data: { Sequence: 1 } };
  }

  async submitAnyTransaction() {
    return { hash: 'mock_hash', result: 'tesSUCCESS', ledger_index: 12345678, validated: true };
  }

  getClient() {
    return {
      request: async () => ({ result: { ledger_hash: 'mock_ledger_hash' } }),
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('AI Constitution DAO - Token Economics Integration Test');
  console.log('='.repeat(70));

  // ========================================
  // Setup
  // ========================================
  console.log('\n[1] SETUP\n');

  const mockClient = new MockXRPLClient();
  const treasuryAddress = 'rDAOTreasury123';

  // Create instances
  const registry = new OracleRegistry(mockClient as any, treasuryAddress);
  const slashingManager = new SlashingManager(
    mockClient as any,
    registry,
    treasuryAddress
  );
  const rewardDistributor = new RewardDistributor(
    mockClient as any,
    registry,
    treasuryAddress
  );
  const fraudVerifier = new FraudProofVerifier();
  const stakingManager = new StakingManager(
    mockClient as any,
    registry,
    slashingManager,
    rewardDistributor,
    treasuryAddress
  );

  console.log('Mock XRPL client initialized');
  console.log('Token economics modules ready');

  // ========================================
  // Oracle Registration
  // ========================================
  console.log('\n[2] ORACLE REGISTRATION\n');

  const oracleAddresses = [
    'oracle_alpha',
    'oracle_beta',
    'oracle_gamma',
    'oracle_delta',
    'oracle_epsilon',
  ];

  // Different stake amounts to test ranking
  const stakeAmounts = [
    '150000000000', // 150k XRP
    '120000000000', // 120k XRP
    '100000000000', // 100k XRP (minimum)
    '100000000000', // 100k XRP (minimum)
    '80000000000',  // 80k XRP (below minimum, should fail)
  ];

  for (let i = 0; i < oracleAddresses.length; i++) {
    mockClient.setWallet(oracleAddresses[i]);

    const result = await stakingManager.stake(stakeAmounts[i]);
    console.log(
      `${oracleAddresses[i]}: ${result.success ? '✓' : '✗'} ${result.message}`
    );

    if (result.position) {
      console.log(`  Stake: ${result.position.staked_amount} drops`);
      console.log(`  Status: ${result.position.status}`);
    }
  }

  // ========================================
  // Active Set Selection
  // ========================================
  console.log('\n[3] ACTIVE SET SELECTION\n');

  // Start a new epoch to select active set
  const epoch = await registry.startNewEpoch();
  console.log(`Epoch ${epoch.epoch_number} started`);
  console.log(`Active set: ${epoch.active_set.length} oracles`);

  for (const address of epoch.active_set) {
    const operator = registry.getOperator(address);
    console.log(`  ${address}: ${operator?.bond_amount} drops`);
  }

  // ========================================
  // Simulate Oracle Participation
  // ========================================
  console.log('\n[4] SIMULATING ORACLE PARTICIPATION\n');

  const proposalsInEpoch = 10;
  console.log(`Simulating ${proposalsInEpoch} proposals...\n`);

  // Simulate participation (some oracles miss reveals)
  for (const address of epoch.active_set) {
    const operator = registry.getOperator(address);
    if (!operator) continue;

    // alpha: perfect participation
    // beta: misses 2 reveals
    // gamma: misses 1 reveal
    // delta: perfect participation
    let revealCount = proposalsInEpoch;

    if (address === 'oracle_beta') {
      revealCount = 8;
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, true);
      registry.recordParticipation(address, false);
      registry.recordParticipation(address, false);
    } else if (address === 'oracle_gamma') {
      revealCount = 9;
      for (let i = 0; i < 9; i++) {
        registry.recordParticipation(address, true);
      }
      registry.recordParticipation(address, false);
    } else {
      for (let i = 0; i < proposalsInEpoch; i++) {
        registry.recordParticipation(address, true);
      }
    }

    const updated = registry.getOperator(address);
    console.log(
      `${address}: ${updated?.metrics.successful_reveals}/${proposalsInEpoch} reveals`
    );
  }

  // ========================================
  // Reward Distribution
  // ========================================
  console.log('\n[5] EPOCH REWARD DISTRIBUTION\n');

  const epochRewards = await rewardDistributor.calculateEpochRewards(
    epoch.epoch_number,
    proposalsInEpoch
  );

  console.log(`Total reward pool: ${epochRewards.total_pool} drops`);
  console.log(`Total stake: ${epochRewards.total_stake} drops\n`);

  for (const reward of epochRewards.rewards) {
    const xrpReward = parseInt(reward.final_reward) / 1000000;
    console.log(`${reward.address}:`);
    console.log(`  Base reward: ${reward.base_reward} drops`);
    console.log(`  Performance: ${reward.performance_multiplier.toFixed(2)}x`);
    console.log(`  Participation: ${(reward.participation_rate * 100).toFixed(0)}%`);
    console.log(`  Final reward: ${reward.final_reward} drops (${xrpReward.toFixed(2)} XRP)`);
  }

  // ========================================
  // Slashing for Non-Reveal
  // ========================================
  console.log('\n[6] SLASHING FOR NON-REVEAL\n');

  // Slash oracle_beta for missing 2 reveals
  const proposal1 = 'proposal_abc123';
  const proposal2 = 'proposal_def456';

  const slashEvent1 = await slashingManager.slashNonReveal('oracle_beta', proposal1);
  const slashEvent2 = await slashingManager.slashNonReveal('oracle_beta', proposal2);

  console.log(`oracle_beta slashed twice:`);
  console.log(`  Slash 1: ${slashEvent1.amount} drops for ${proposal1}`);
  console.log(`  Slash 2: ${slashEvent2.amount} drops for ${proposal2}`);

  const betaPosition = await stakingManager.getPosition('oracle_beta');
  console.log(`  Pending slashes: ${betaPosition?.pending_slashes} drops`);
  console.log(`  Effective stake: ${betaPosition?.effective_stake} drops`);

  // ========================================
  // Fraud Proof Submission
  // ========================================
  console.log('\n[7] FRAUD PROOF SUBMISSION\n');

  // Create a fraudulent verdict scenario
  const claimedVerdict: ChannelAVerdict = {
    pass: true, // Oracle claimed it passed
    complexity_score: 500,
    paradox_found: false,
    cycle_found: false,
  };

  const actualVerdict: ChannelAVerdict = {
    pass: false, // But it should have failed
    complexity_score: 500,
    paradox_found: true, // Because paradox was found
    cycle_found: false,
  };

  // Create fraud proof
  const fraudProof = FraudProofVerifier.createFraudProof(
    'proposal_fraudulent',
    JSON.stringify({ action: 'test' }),
    'This proposal passes iff it fails', // Paradoxical text
    claimedVerdict,
    actualVerdict
  );

  // Submit fraud proof
  const submission = fraudVerifier.submitFraudProof(
    fraudProof,
    'challenger_address',
    'oracle_gamma'
  );

  console.log(`Fraud proof submitted: ${submission.id}`);
  console.log(`Challenger: ${submission.challenger}`);
  console.log(`Accused: ${submission.accused_oracle}`);

  // Verify fraud proof
  const verificationResult = await fraudVerifier.verifyFraudProof(submission.id);

  console.log(`\nVerification result:`);
  console.log(`  Fraud detected: ${verificationResult.fraud_detected ? '✓ YES' : '✗ NO'}`);
  if (verificationResult.discrepancies.length > 0) {
    console.log('  Discrepancies:');
    for (const d of verificationResult.discrepancies) {
      console.log(`    - ${d}`);
    }
  }

  // ========================================
  // Ejection for Fraud
  // ========================================
  console.log('\n[8] EJECTION FOR FRAUD\n');

  if (verificationResult.fraud_detected) {
    const fraudSlash = await slashingManager.slashFraud('oracle_gamma', fraudProof);

    console.log(`oracle_gamma EJECTED for fraud:`);
    console.log(`  Slash amount: ${fraudSlash.amount} drops (100%)`);
    console.log(`  Slash type: ${fraudSlash.slash_type}`);

    const gammaOperator = registry.getOperator('oracle_gamma');
    console.log(`  New status: ${gammaOperator?.status}`);
    console.log(`  Bond remaining: ${gammaOperator?.bond_amount} drops`);
  }

  // ========================================
  // Reward Claiming
  // ========================================
  console.log('\n[9] REWARD CLAIMING\n');

  for (const address of ['oracle_alpha', 'oracle_delta']) {
    mockClient.setWallet(address);
    const claimResult = await stakingManager.claimRewards();

    if (claimResult.success) {
      const xrp = parseInt(claimResult.message.match(/\d+/)?.[0] || '0') / 1000000;
      console.log(`${address} claimed rewards: ${xrp.toFixed(2)} XRP`);
    }
  }

  // ========================================
  // Unstaking Flow
  // ========================================
  console.log('\n[10] UNSTAKING FLOW\n');

  mockClient.setWallet('oracle_delta');

  // Initiate unstake
  const unstakeInit = await stakingManager.initiateUnstake();
  console.log(`oracle_delta: ${unstakeInit.message}`);

  if (unstakeInit.position?.unbonding) {
    const availableAt = new Date(unstakeInit.position.unbonding.available_at);
    console.log(`  Available at: ${availableAt.toISOString()}`);
    console.log(`  Amount: ${unstakeInit.position.unbonding.amount} drops`);
  }

  // ========================================
  // Statistics
  // ========================================
  console.log('\n[11] STAKING STATISTICS\n');

  const stats = stakingManager.getStatistics();

  console.log(`Total staked: ${stats.total_staked} drops`);
  console.log(`Active oracles: ${stats.active_oracles}`);
  console.log(`Candidate oracles: ${stats.candidate_oracles}`);
  console.log(`Minimum stake for active set: ${stats.minimum_stake_for_active} drops`);
  console.log(`\nReward statistics:`);
  console.log(`  Total distributed: ${stats.reward_stats.total_distributed} drops`);
  console.log(`  Total epochs: ${stats.reward_stats.total_epochs}`);
  console.log(`  Average per epoch: ${stats.reward_stats.average_per_epoch} drops`);

  if (stats.reward_stats.top_earners.length > 0) {
    console.log(`\nTop earners:`);
    for (const earner of stats.reward_stats.top_earners) {
      const xrp = parseInt(earner.total) / 1000000;
      console.log(`  ${earner.address}: ${xrp.toFixed(2)} XRP`);
    }
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 3 SUMMARY');
  console.log('='.repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  Token Economics Flow                                               │
│                                                                     │
│  STAKING                                                            │
│  ├── Register with ORACLE_BOND (100k+ XRP)                          │
│  ├── Higher stake = higher priority for active set                  │
│  └── Top 101 by stake become active oracles                         │
│                                                                     │
│  REWARDS                                                            │
│  ├── Epoch-based distribution from reward pool                      │
│  ├── Pro-rata based on stake weight                                 │
│  ├── Performance multiplier (0.5x to 1.5x)                          │
│  └── Claim rewards at any time                                      │
│                                                                     │
│  SLASHING                                                           │
│  ├── Non-reveal: 15% of bond per offense                            │
│  ├── Inactivity: 5% after 3+ missed reveals                         │
│  ├── Channel A Fraud: 100% + permanent ejection                     │
│  └── Channel B: No penalty (protects dissent)                       │
│                                                                     │
│  FRAUD PROOFS                                                       │
│  ├── Anyone can submit proof of Channel A misbehavior               │
│  ├── Re-runs deterministic verification                             │
│  ├── If verdict differs = fraud proven                              │
│  └── Successful proof triggers 100% slash + ejection                │
│                                                                     │
│  UNSTAKING                                                          │
│  ├── Initiate unbonding                                             │
│  ├── Wait one epoch (~2 weeks)                                      │
│  ├── Deduct pending slashes                                         │
│  └── Release remaining bond                                         │
└─────────────────────────────────────────────────────────────────────┘
`);
  console.log('Token economics test completed successfully!');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
