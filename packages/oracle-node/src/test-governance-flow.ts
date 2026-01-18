/**
 * Integration Test: Complete Governance Flow
 *
 * Demonstrates the full proposal lifecycle:
 * 1. Proposal submission
 * 2. Oracle review (Channel A + B)
 * 3. Routing based on decidability class
 * 4. Voting with dynamic friction
 * 5. Timelock enforcement
 * 6. Execution
 *
 * Run with: npx ts-node src/test-governance-flow.ts
 */

import {
  GovernanceOrchestrator,
  GovernanceEvent,
  GovernancePhase,
} from './voting/orchestrator';
import { DecidabilityRouter, Route } from './voting/router';
import { OracleRegistry, OracleStatus } from './network/registry';
import { AggregatedVerdict } from './network/consensus';
import {
  GovernanceLayer,
  DecidabilityClass,
  Vote,
  calculateFriction,
  CONFIG,
} from './types';

// Mock XRPL Client
class MockXRPLClient {
  private wallet = { address: 'rProposer123' };
  getWallet() { return this.wallet; }
  setWallet(address: string) { this.wallet = { address }; }
  async getLedgerIndex() { return 12345678; }
  async submitMemo() { return { hash: 'mock_hash', result: 'tesSUCCESS' }; }
  getClient() { return { request: async () => ({ result: {} }) }; }
}

function createMockVerdict(
  channelAPass: boolean,
  alignmentScore: number,
  decidabilityClass: DecidabilityClass
): AggregatedVerdict {
  return {
    proposal_id: '',
    participation_count: 3,
    total_oracles: 3,
    quorum_reached: true,
    channel_a_consensus: {
      pass: channelAPass,
      complexity_score: 500,
      paradox_found: false,
      cycle_found: false,
    },
    channel_b_consensus: {
      semantic_alignment_score: alignmentScore,
      decidability_class: decidabilityClass,
    },
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('AI Constitution DAO - Complete Governance Flow Test');
  console.log('='.repeat(70));

  // ========================================
  // Setup
  // ========================================
  console.log('\n[1] SETUP\n');

  const mockClient = new MockXRPLClient();
  const daoAddress = 'rDAOTreasury123';

  const registry = new OracleRegistry(mockClient as any, daoAddress);
  const orchestrator = new GovernanceOrchestrator(
    mockClient as any,
    daoAddress,
    registry
  );

  // Set total voting supply
  orchestrator.setTotalVotingSupply('1000000000000'); // 1M tokens

  // Track events
  const events: string[] = [];
  Object.values(GovernanceEvent).forEach(event => {
    orchestrator.on(event, (data) => {
      events.push(`${event}: ${JSON.stringify(data).slice(0, 60)}...`);
    });
  });

  console.log('Governance orchestrator initialized');
  console.log('Event listeners attached');

  // ========================================
  // Scenario 1: Standard L2 Proposal (Class II)
  // ========================================
  console.log('\n[2] SCENARIO 1: Standard L2 Proposal (Class II)\n');

  const proposal1 = await orchestrator.submitProposal({
    logic_ast: JSON.stringify({
      action: 'update_parameter',
      parameter: 'fee_rate',
      value: 0.001,
    }),
    text: 'Update the transaction fee rate to 0.1% for improved competitiveness.',
    layer: GovernanceLayer.L2Operational,
  });

  console.log(`Proposal ID: ${proposal1.proposal.id.slice(0, 32)}...`);
  console.log(`Phase: ${proposal1.phase}`);
  console.log(`Layer: ${proposal1.proposal.layer}`);

  // Simulate oracle verdicts
  const verdict1 = createMockVerdict(true, 0.85, DecidabilityClass.II);
  verdict1.proposal_id = proposal1.proposal.id;

  console.log('\nProcessing oracle verdicts...');
  orchestrator.processOracleVerdicts(proposal1.proposal.id, verdict1);

  const updated1 = orchestrator.getProposal(proposal1.proposal.id);
  console.log(`Route: ${updated1?.routing?.route}`);
  console.log(`Phase: ${updated1?.phase}`);
  console.log(`Friction: Quorum=${(updated1?.proposal.friction?.required_quorum! * 100).toFixed(1)}%, Timelock=${updated1?.proposal.friction?.timelock_duration}s`);

  // Cast votes
  console.log('\nCasting votes...');
  const voters = [
    { address: 'voter_1', power: '300000000000', vote: Vote.Yes },
    { address: 'voter_2', power: '250000000000', vote: Vote.Yes },
    { address: 'voter_3', power: '150000000000', vote: Vote.No },
    { address: 'voter_4', power: '100000000000', vote: Vote.Yes },
    { address: 'voter_5', power: '50000000000', vote: Vote.Abstain },
  ];

  for (const v of voters) {
    await orchestrator.castVote(
      proposal1.proposal.id,
      v.address,
      v.vote,
      v.power
    );
    console.log(`  ${v.address}: ${v.vote} (${parseInt(v.power) / 1e9}k power)`);
  }

  // Close voting
  console.log('\nClosing voting...');
  orchestrator.closeVoting(proposal1.proposal.id);

  const final1 = orchestrator.getProposal(proposal1.proposal.id);
  console.log(`Voting Tally:`);
  console.log(`  Yes: ${parseInt(final1?.votingTally?.yes_power || '0') / 1e9}k`);
  console.log(`  No: ${parseInt(final1?.votingTally?.no_power || '0') / 1e9}k`);
  console.log(`  Participation: ${(final1?.votingTally?.participation_rate! * 100).toFixed(1)}%`);
  console.log(`  Quorum Reached: ${final1?.votingTally?.quorum_reached}`);
  console.log(`  Passed: ${final1?.votingTally?.passed}`);
  console.log(`  Phase: ${final1?.phase}`);

  // ========================================
  // Scenario 2: L1 Constitutional Amendment (Class II)
  // ========================================
  console.log('\n[3] SCENARIO 2: L1 Constitutional Amendment\n');

  mockClient.setWallet('rConstitutionalProposer');

  const proposal2 = await orchestrator.submitProposal({
    logic_ast: JSON.stringify({
      action: 'amend_constitution',
      section: 'voting_rules',
      change: 'increase_quorum',
    }),
    text: 'Increase the base quorum requirement from 10% to 15% to ensure broader participation.',
    layer: GovernanceLayer.L1Constitutional,
  });

  console.log(`Proposal ID: ${proposal2.proposal.id.slice(0, 32)}...`);
  console.log(`Layer: ${proposal2.proposal.layer}`);

  // Higher alignment since it's a well-reasoned constitutional change
  const verdict2 = createMockVerdict(true, 0.72, DecidabilityClass.II);
  verdict2.proposal_id = proposal2.proposal.id;

  orchestrator.processOracleVerdicts(proposal2.proposal.id, verdict2);

  const updated2 = orchestrator.getProposal(proposal2.proposal.id);
  console.log(`Route: ${updated2?.routing?.route}`);
  console.log(`Requirements:`);
  for (const req of updated2?.routing?.requirements || []) {
    console.log(`  - ${req.description}`);
  }
  console.log(`Friction: Quorum=${(updated2?.proposal.friction?.required_quorum! * 100).toFixed(1)}%, Timelock=${(updated2?.proposal.friction?.timelock_duration! / 3600).toFixed(1)}h`);

  // ========================================
  // Scenario 3: Class III Proposal (Jury Required)
  // ========================================
  console.log('\n[4] SCENARIO 3: Class III Proposal (Jury Required)\n');

  mockClient.setWallet('rEthicalProposer');

  const proposal3 = await orchestrator.submitProposal({
    logic_ast: JSON.stringify({
      action: 'ethics_policy',
      type: 'ai_usage_guidelines',
    }),
    text: 'Establish ethical guidelines for AI usage in governance that balance efficiency with human oversight.',
    layer: GovernanceLayer.L2Operational,
  });

  console.log(`Proposal ID: ${proposal3.proposal.id.slice(0, 32)}...`);

  // Class III - requires human judgment
  const verdict3 = createMockVerdict(true, 0.65, DecidabilityClass.III);
  verdict3.proposal_id = proposal3.proposal.id;

  orchestrator.processOracleVerdicts(proposal3.proposal.id, verdict3);

  const updated3 = orchestrator.getProposal(proposal3.proposal.id);
  console.log(`Route: ${updated3?.routing?.route}`);
  console.log(`Phase: ${updated3?.phase}`);
  console.log(`Reason: ${updated3?.routing?.reason}`);

  // Simulate jury approval
  console.log('\nSimulating jury verdict...');
  orchestrator.recordJuryVerdict(proposal3.proposal.id, 'APPROVED', 15, 4);

  const final3 = orchestrator.getProposal(proposal3.proposal.id);
  console.log(`After Jury: Phase=${final3?.phase}`);

  // ========================================
  // Scenario 4: Channel A Failure (Rejection)
  // ========================================
  console.log('\n[5] SCENARIO 4: Channel A Failure (Rejection)\n');

  mockClient.setWallet('rMaliciousProposer');

  const proposal4 = await orchestrator.submitProposal({
    logic_ast: JSON.stringify({
      action: 'self_reference',
      '$ref:self': true, // This would trigger cycle detection
    }),
    text: 'This proposal passes if and only if it fails.',
    layer: GovernanceLayer.L2Operational,
  });

  console.log(`Proposal ID: ${proposal4.proposal.id.slice(0, 32)}...`);

  // Channel A fails (paradox detected)
  const verdict4 = createMockVerdict(false, 0.0, DecidabilityClass.II);
  verdict4.proposal_id = proposal4.proposal.id;
  verdict4.channel_a_consensus!.paradox_found = true;

  orchestrator.processOracleVerdicts(proposal4.proposal.id, verdict4);

  const final4 = orchestrator.getProposal(proposal4.proposal.id);
  console.log(`Phase: ${final4?.phase}`);
  console.log(`Route: ${final4?.routing?.route}`);
  console.log(`Reason: ${final4?.routing?.reason}`);

  // ========================================
  // Scenario 5: Class I (PoUW Verification)
  // ========================================
  console.log('\n[6] SCENARIO 5: Class I (PoUW Verification)\n');

  mockClient.setWallet('rFormalProposer');

  const proposal5 = await orchestrator.submitProposal({
    logic_ast: JSON.stringify({
      action: 'formal_proof',
      theorem: 'transaction_safety',
      proof_type: 'mathematical',
    }),
    text: 'Implement a formally verified transaction validation algorithm.',
    layer: GovernanceLayer.L3Execution,
  });

  console.log(`Proposal ID: ${proposal5.proposal.id.slice(0, 32)}...`);

  // Class I - formally verifiable
  const verdict5 = createMockVerdict(true, 0.92, DecidabilityClass.I);
  verdict5.proposal_id = proposal5.proposal.id;

  orchestrator.processOracleVerdicts(proposal5.proposal.id, verdict5);

  const updated5 = orchestrator.getProposal(proposal5.proposal.id);
  console.log(`Route: ${updated5?.routing?.route}`);
  console.log(`Phase: ${updated5?.phase}`);
  console.log(`Requirements:`);
  for (const req of updated5?.routing?.requirements || []) {
    console.log(`  - ${req.description}`);
  }

  // ========================================
  // Routing Decision Matrix
  // ========================================
  console.log('\n[7] ROUTING DECISION MATRIX\n');

  const router = new DecidabilityRouter();

  const testCases = [
    { layer: GovernanceLayer.L2Operational, class: DecidabilityClass.I, pass: true, align: 0.9 },
    { layer: GovernanceLayer.L2Operational, class: DecidabilityClass.II, pass: true, align: 0.8 },
    { layer: GovernanceLayer.L2Operational, class: DecidabilityClass.III, pass: true, align: 0.6 },
    { layer: GovernanceLayer.L1Constitutional, class: DecidabilityClass.II, pass: true, align: 0.7 },
    { layer: GovernanceLayer.L0Immutable, class: DecidabilityClass.II, pass: true, align: 1.0 },
    { layer: GovernanceLayer.L3Execution, class: DecidabilityClass.I, pass: false, align: 0.5 },
  ];

  console.log('Layer               | Class | Ch.A | Align | Route             | Quorum');
  console.log('-'.repeat(75));

  for (const tc of testCases) {
    const mockProposal: any = {
      layer: tc.layer,
      channel_a_verdict: { pass: tc.pass },
      channel_b_verdict: {
        decidability_class: tc.class,
        semantic_alignment_score: tc.align,
      },
    };

    const decision = router.route(mockProposal);
    const layerName = tc.layer.replace('Governance.', '').padEnd(18);
    const className = tc.class.padEnd(5);
    const passStr = tc.pass ? 'PASS' : 'FAIL';
    const routeName = decision.route.padEnd(17);
    const quorum = (decision.friction.required_quorum * 100).toFixed(0) + '%';

    console.log(`${layerName} | ${className} | ${passStr} | ${tc.align.toFixed(1)}   | ${routeName} | ${quorum}`);
  }

  // ========================================
  // Events Log
  // ========================================
  console.log('\n[8] GOVERNANCE EVENTS\n');
  console.log(`Total events emitted: ${events.length}`);
  console.log('\nLast 10 events:');
  events.slice(-10).forEach((e, i) => {
    console.log(`  ${i + 1}. ${e}`);
  });

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 4 SUMMARY');
  console.log('='.repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  Complete Governance Flow                                           │
│                                                                     │
│  SUBMISSION                                                         │
│  ├── Proposer submits proposal with logic_ast + text                │
│  ├── Canonical hash becomes proposal ID                             │
│  └── Triggers oracle review automatically                           │
│                                                                     │
│  ORACLE REVIEW                                                      │
│  ├── Channel A: Deterministic verification (HARD GATE)              │
│  │   ├── Complexity check                                           │
│  │   ├── Paradox detection                                          │
│  │   └── Cycle detection                                            │
│  ├── Channel B: Heuristic assessment (SOFT GATE)                    │
│  │   ├── Semantic alignment score (0.0 - 1.0)                       │
│  │   └── Decidability classification (I, II, III)                   │
│  └── Commit-reveal protocol for consensus                           │
│                                                                     │
│  ROUTING                                                            │
│  ├── Class I  → PoUW Marketplace (formal verification)              │
│  ├── Class II → Standard Voting (with friction)                     │
│  └── Class III → Constitutional Jury (21 members)                   │
│                                                                     │
│  VOTING                                                             │
│  ├── Dynamic friction based on alignment score                      │
│  │   ├── Low alignment → High quorum + long timelock                │
│  │   └── High alignment → Low quorum + short timelock               │
│  ├── Token-weighted votes with delegation                           │
│  └── Simple majority of non-abstaining votes                        │
│                                                                     │
│  LAYER REQUIREMENTS                                                 │
│  ├── L0 Immutable: Cannot be modified                               │
│  ├── L1 Constitutional: 67% supermajority, 30-day timelock          │
│  ├── L2 Operational: Standard friction, 24h base timelock           │
│  └── L3 Execution: Minimal friction, 12h base timelock              │
│                                                                     │
│  EXECUTION                                                          │
│  ├── Timelock period after passing                                  │
│  ├── Anyone can trigger execution after expiry                      │
│  └── On-chain state update                                          │
└─────────────────────────────────────────────────────────────────────┘
`);
  console.log('Governance flow test completed successfully!');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
