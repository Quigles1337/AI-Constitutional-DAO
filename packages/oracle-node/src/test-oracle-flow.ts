/**
 * Integration Test: Full Oracle Flow (Local Simulation)
 *
 * Demonstrates the complete proposal lifecycle:
 * 1. Submit proposal
 * 2. Oracle commit-reveal consensus
 * 3. Verdict aggregation
 * 4. Routing and voting
 *
 * Run with: npx ts-node src/test-oracle-flow.ts
 */

import { createHash } from 'crypto';
import {
  GovernanceLayer,
  DecidabilityClass,
  ProposalStatus,
  ChannelAVerdict,
  ChannelBVerdict,
  calculateFriction,
  CONFIG,
} from './types';
import {
  CommitRevealProtocol,
  OracleVerdict,
  ProtocolPhase,
} from './network/consensus';

// Mock XRPL Client for local testing
class MockXRPLClient {
  private wallet = { address: 'rTestAddress123' };
  getWallet() { return this.wallet; }
  async getLedgerIndex() { return 12345678; }
  async submitMemo() { return { hash: 'mock_hash', result: 'tesSUCCESS', ledger_index: 12345678, validated: true }; }
  getClient() { return { request: async () => ({ result: { ledger_hash: 'mock_ledger_hash' } }) }; }
}

// Simulated Channel A verification (would call Rust in production)
function simulateChannelA(text: string, logicAst: string): ChannelAVerdict {
  // Simple paradox check
  const paradoxFound = /passes.*iff.*fails|fails.*iff.*passes/i.test(text) ||
    /this.*statement.*is.*false/i.test(text);

  // Check for cycles (simplified)
  let cycleFound = false;
  try {
    const ast = JSON.parse(logicAst);
    // Simple self-reference check
    cycleFound = JSON.stringify(ast).includes('$ref:self');
  } catch {
    cycleFound = false;
  }

  // Simulate complexity score (zlib compression approximation)
  const payload = logicAst + '.' + text.toLowerCase().replace(/[^\w\s]/g, '');
  const complexityScore = Math.floor(payload.length * 0.6); // Rough approximation

  const pass = !paradoxFound && !cycleFound && complexityScore < CONFIG.MAX_COMPLEXITY;

  return {
    pass,
    complexity_score: complexityScore,
    paradox_found: paradoxFound,
    cycle_found: cycleFound,
  };
}

// Simulated Channel B verification (would use Claude API in production)
function simulateChannelB(text: string, channelAPass: boolean): ChannelBVerdict {
  // Base alignment on whether it passes Channel A and content analysis
  let alignmentScore = channelAPass ? 0.7 : 0.3;

  // Adjust based on keywords
  if (text.toLowerCase().includes('community') || text.toLowerCase().includes('improvement')) {
    alignmentScore += 0.1;
  }
  if (text.toLowerCase().includes('harm') || text.toLowerCase().includes('centralize')) {
    alignmentScore -= 0.2;
  }

  alignmentScore = Math.max(0, Math.min(1, alignmentScore));

  // Determine decidability class
  let decidabilityClass = DecidabilityClass.II;
  if (text.toLowerCase().includes('formal') || text.toLowerCase().includes('mathematical')) {
    decidabilityClass = DecidabilityClass.I;
  }
  if (text.toLowerCase().includes('ethical') || text.toLowerCase().includes('subjective')) {
    decidabilityClass = DecidabilityClass.III;
  }

  return {
    semantic_alignment_score: alignmentScore,
    decidability_class: decidabilityClass,
    reasoning: `Automated analysis: alignment=${alignmentScore.toFixed(2)}, class=${decidabilityClass}`,
  };
}

function canonicalize(logicAst: string, text: string): string {
  const ast = JSON.parse(logicAst);
  const sortedAst = JSON.stringify(ast, Object.keys(ast).sort());
  const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  return sortedAst + '.' + normalizedText;
}

async function main() {
  console.log('='.repeat(70));
  console.log('AI Constitution DAO - Oracle Flow Integration Test (Local)');
  console.log('='.repeat(70));

  // ========================================
  // Setup
  // ========================================
  console.log('\n[1] SETUP\n');

  const mockClient = new MockXRPLClient();
  const daoAddress = 'rDAOTreasury123';

  // Create protocol instance
  const protocol = new CommitRevealProtocol(mockClient as any, daoAddress);

  console.log('Mock XRPL client initialized');
  console.log('Commit-reveal protocol ready');
  console.log('Simulating 3 oracle nodes');

  // ========================================
  // Submit Proposal
  // ========================================
  console.log('\n[2] SUBMIT PROPOSAL\n');

  const proposalInput = {
    logic_ast: JSON.stringify({
      action: 'transfer',
      amount: 1000,
      recipient: 'community_fund',
      conditions: {
        requires_approval: true,
        min_quorum: 0.1,
      },
    }),
    text: 'Transfer 1000 tokens to the community development fund for Q1 2026 initiatives. This allocation will support developer grants, community events, and infrastructure improvements.',
    layer: GovernanceLayer.L2Operational,
  };

  // Compute proposal ID
  const canonical = canonicalize(proposalInput.logic_ast, proposalInput.text);
  const proposalId = createHash('sha256').update(canonical).digest('hex');

  console.log(`Layer: ${proposalInput.layer}`);
  console.log(`Text: "${proposalInput.text.slice(0, 60)}..."`);
  console.log(`\nProposal ID: ${proposalId.slice(0, 32)}...`);

  // Initialize protocol for this proposal
  protocol.initializeProposal(proposalId);
  console.log(`Status: ChannelAReview`);

  // ========================================
  // Oracle Review (3 Oracles)
  // ========================================
  console.log('\n[3] ORACLE REVIEW\n');

  const oracleVerdicts: OracleVerdict[] = [];
  const oracleAddresses = ['oracle_1', 'oracle_2', 'oracle_3'];

  for (let i = 0; i < 3; i++) {
    console.log(`\nOracle ${i + 1} (${oracleAddresses[i]}):`);

    // Channel A: Deterministic verification
    const channelA = simulateChannelA(proposalInput.text, proposalInput.logic_ast);
    console.log(`  Channel A: ${channelA.pass ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`    - Complexity: ${channelA.complexity_score} (max: ${CONFIG.MAX_COMPLEXITY})`);
    console.log(`    - Paradox: ${channelA.paradox_found ? 'FOUND' : 'none'}`);
    console.log(`    - Cycles: ${channelA.cycle_found ? 'FOUND' : 'none'}`);

    // Channel B: Heuristic verification
    const channelB = simulateChannelB(proposalInput.text, channelA.pass);
    console.log(`  Channel B:`);
    console.log(`    - Alignment: ${(channelB.semantic_alignment_score * 100).toFixed(1)}%`);
    console.log(`    - Decidability: Class ${channelB.decidability_class}`);

    const verdict: OracleVerdict = {
      channel_a: channelA,
      channel_b: channelB,
      timestamp: Date.now(),
    };
    oracleVerdicts.push(verdict);
  }

  // ========================================
  // Commit-Reveal Protocol
  // ========================================
  console.log('\n[4] COMMIT-REVEAL PROTOCOL\n');

  // Commit phase
  console.log('COMMIT PHASE:');
  const commitments: { oracle: string; hash: string; nonce: string }[] = [];

  for (let i = 0; i < oracleVerdicts.length; i++) {
    const { commitment_hash, nonce } = protocol.createCommitment(
      proposalId,
      oracleVerdicts[i]
    );
    commitments.push({ oracle: oracleAddresses[i], hash: commitment_hash, nonce });
    console.log(`  ${oracleAddresses[i]}: ${commitment_hash.slice(0, 24)}...`);

    // Record commitment
    protocol.processCommitment({
      proposal_id: proposalId,
      commitment_hash,
      oracle_address: oracleAddresses[i],
      ledger_index: 12345678 + i,
      timestamp: Date.now(),
    });
  }

  // Transition to reveal phase
  protocol.transitionToRevealPhase(proposalId);
  const state = protocol.getState(proposalId);
  console.log(`\n  Phase: ${state?.phase}`);

  // Reveal phase
  console.log('\nREVEAL PHASE:');
  for (let i = 0; i < oracleVerdicts.length; i++) {
    const verified = protocol.processReveal({
      proposal_id: proposalId,
      verdict: oracleVerdicts[i],
      nonce: commitments[i].nonce,
      oracle_address: oracleAddresses[i],
      ledger_index: 12345680 + i,
    });
    console.log(`  ${oracleAddresses[i]}: ${verified ? '✓ VALID' : '✗ INVALID'}`);
  }

  // ========================================
  // Tally Results
  // ========================================
  console.log('\n[5] TALLY RESULTS\n');

  const totalOracles = 3;
  const aggregatedVerdict = protocol.tally(proposalId, totalOracles);

  console.log(`Participation: ${aggregatedVerdict.participation_count}/${aggregatedVerdict.total_oracles}`);
  console.log(`Quorum Required: ${Math.ceil(totalOracles * CONFIG.ORACLE_QUORUM)} (${(CONFIG.ORACLE_QUORUM * 100).toFixed(0)}%)`);
  console.log(`Quorum Reached: ${aggregatedVerdict.quorum_reached ? '✓ YES' : '✗ NO'}`);

  if (aggregatedVerdict.channel_a_consensus) {
    console.log(`\nChannel A Consensus:`);
    console.log(`  Pass: ${aggregatedVerdict.channel_a_consensus.pass ? '✓ YES' : '✗ NO'}`);
    console.log(`  Complexity: ${aggregatedVerdict.channel_a_consensus.complexity_score}`);
  }

  if (aggregatedVerdict.channel_b_consensus) {
    console.log(`\nChannel B Consensus:`);
    console.log(`  Alignment: ${(aggregatedVerdict.channel_b_consensus.semantic_alignment_score * 100).toFixed(1)}%`);
    console.log(`  Decidability: Class ${aggregatedVerdict.channel_b_consensus.decidability_class}`);
  }

  // ========================================
  // Calculate Friction
  // ========================================
  console.log('\n[6] FRICTION CALCULATION\n');

  const alignmentScore = aggregatedVerdict.channel_b_consensus?.semantic_alignment_score || 0.5;
  const friction = calculateFriction(alignmentScore);

  console.log(`Input Alignment Score: ${(alignmentScore * 100).toFixed(1)}%`);
  console.log(`\nCalculated Friction:`);
  console.log(`  Quorum Multiplier: ${friction.quorum_multiplier.toFixed(2)}x`);
  console.log(`  Timelock Multiplier: ${friction.timelock_multiplier.toFixed(2)}x`);
  console.log(`  Required Quorum: ${(friction.required_quorum * 100).toFixed(1)}%`);
  console.log(`  Timelock Duration: ${(friction.timelock_duration / 3600).toFixed(1)} hours`);

  // ========================================
  // Routing Decision
  // ========================================
  console.log('\n[7] ROUTING DECISION\n');

  const decidabilityClass = aggregatedVerdict.channel_b_consensus?.decidability_class;
  const channelAPassed = aggregatedVerdict.channel_a_consensus?.pass;

  if (!channelAPassed) {
    console.log(`Route: REJECTED (Channel A failed)`);
    console.log(`Status: ${ProposalStatus.Rejected}`);
  } else {
    switch (decidabilityClass) {
      case DecidabilityClass.I:
        console.log(`Route: PoUW Marketplace (Class I - Formally Verifiable)`);
        console.log(`  -> Would route to COINjecture miners for formal verification`);
        console.log(`Status: ${ProposalStatus.Voting}`);
        break;
      case DecidabilityClass.II:
        console.log(`Route: Standard Voting (Class II - Deterministic)`);
        console.log(`  -> Proceeds to governance vote with calculated friction`);
        console.log(`Status: ${ProposalStatus.Voting}`);
        break;
      case DecidabilityClass.III:
        console.log(`Route: Human Review (Class III - Requires Judgment)`);
        console.log(`  -> Would escalate to Constitutional Jury (21 members)`);
        console.log(`Status: ${ProposalStatus.RequiresHumanReview}`);
        break;
    }
  }

  // ========================================
  // Simulate Voting
  // ========================================
  console.log('\n[8] SIMULATED VOTING\n');

  if (channelAPassed && decidabilityClass !== DecidabilityClass.III) {
    const votes = [
      { voter: 'holder_1', vote: 'YES', power: 150 },
      { voter: 'holder_2', vote: 'YES', power: 200 },
      { voter: 'holder_3', vote: 'NO', power: 75 },
      { voter: 'holder_4', vote: 'YES', power: 100 },
      { voter: 'holder_5', vote: 'ABSTAIN', power: 50 },
    ];

    console.log('Votes cast:');
    let yesVotes = 0, noVotes = 0, abstainVotes = 0, totalPower = 0;
    for (const v of votes) {
      console.log(`  ${v.voter}: ${v.vote.padEnd(7)} (power: ${v.power})`);
      if (v.vote === 'YES') yesVotes += v.power;
      else if (v.vote === 'NO') noVotes += v.power;
      else abstainVotes += v.power;
      totalPower += v.power;
    }

    const totalVotingPower = 1000;
    const participation = totalPower / totalVotingPower;
    const quorumReached = participation >= friction.required_quorum;
    const passed = yesVotes > noVotes;

    console.log(`\nResults:`);
    console.log(`  Yes: ${yesVotes}`);
    console.log(`  No: ${noVotes}`);
    console.log(`  Abstain: ${abstainVotes}`);
    console.log(`  Participation: ${(participation * 100).toFixed(1)}%`);
    console.log(`  Quorum Reached: ${quorumReached ? '✓ YES' : '✗ NO'}`);
    console.log(`  Passed: ${passed && quorumReached ? '✓ YES' : '✗ NO'}`);

    const finalStatus = !quorumReached ? ProposalStatus.Rejected
      : passed ? ProposalStatus.Passed
      : ProposalStatus.Rejected;
    console.log(`\nFinal Status: ${finalStatus}`);
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(70));
  console.log('FLOW SUMMARY');
  console.log('='.repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  Proposal Submitted                                                  │
│       ↓                                                              │
│  Channel A Review (3 oracles)                                        │
│       ↓                                                              │
│  Channel B Review (3 oracles)                                        │
│       ↓                                                              │
│  Commit-Reveal Protocol                                              │
│    • Commit: hash(verdict + nonce)                                   │
│    • Reveal: verdict + nonce                                         │
│    • Verify: recompute hash matches                                  │
│       ↓                                                              │
│  Tally & Consensus                                                   │
│    • Channel A: Majority vote on PASS/FAIL                           │
│    • Channel B: Average alignment, majority class                    │
│       ↓                                                              │
│  Route by Decidability Class                                         │
│    • Class I  → PoUW Formal Verification                             │
│    • Class II → Standard Voting + Friction                           │
│    • Class III → Constitutional Jury                                 │
│       ↓                                                              │
│  Voting with Dynamic Friction                                        │
│    • Lower alignment → Higher quorum/timelock                        │
│       ↓                                                              │
│  Final Status: PASSED / REJECTED / EXECUTED                          │
└─────────────────────────────────────────────────────────────────────┘
`);
  console.log('Integration test completed successfully!');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
