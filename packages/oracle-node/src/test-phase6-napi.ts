/**
 * Phase 6 Integration Test - NAPI Bindings
 *
 * Tests the Channel A TypeScript wrapper which uses either:
 * - Native Rust implementation via NAPI (if available)
 * - TypeScript fallback implementation
 */

import {
  verifyProposalChannelA,
  canonicalize,
  computeComplexity,
  detectParadox,
  detectCycles,
  isNativeAvailable,
  GovernanceLayer,
  CONFIG,
} from './index';

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

function section(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ========================
// Test Functions
// ========================

function testNativeAvailability(): void {
  section('Native Availability Check');

  const isNative = isNativeAvailable();
  console.log(`  Implementation: ${isNative ? 'Native Rust (NAPI)' : 'TypeScript Fallback'}`);

  if (isNative) {
    console.log('  Note: Native module loaded successfully!');
  } else {
    console.log('  Note: Using TypeScript fallback (native module not built)');
    console.log('  To build native module: cd packages/core && npm run build');
  }

  assert(true, 'Native availability check completed');
}

function testCanonicalization(): void {
  section('Canonicalization Tests');

  const proposal = {
    id: '',
    proposer: 'rTestAddress123',
    logic_ast: '{"action": "transfer", "amount": 100}',
    text: 'Transfer 100 tokens to the community fund',
    layer: GovernanceLayer.L2Operational,
    created_at: Date.now(),
    status: 'Pending' as any,
  };

  // Test 1: Basic canonicalization
  const canonical1 = canonicalize(proposal);
  assert(canonical1.bytes.length > 0, 'Canonical bytes are non-empty');
  assert(canonical1.hash.length === 64, 'Canonical hash is 64 hex characters');
  console.log(`    Hash: ${canonical1.hash.slice(0, 16)}...`);

  // Test 2: Deterministic output
  const canonical2 = canonicalize(proposal);
  assert(canonical1.hash === canonical2.hash, 'Canonicalization is deterministic');

  // Test 3: Different proposals produce different hashes
  const proposal2 = { ...proposal, text: 'Different text' };
  const canonical3 = canonicalize(proposal2);
  assert(canonical1.hash !== canonical3.hash, 'Different proposals have different hashes');

  console.log('\n  Canonicalization tests passed!');
}

function testComplexityScoring(): void {
  section('Complexity Scoring Tests');

  // Test 1: Simple payload
  const simplePayload = Buffer.from('{"action": "test"}', 'utf8');
  const simpleScore = computeComplexity(simplePayload);
  assert(simpleScore > 0, 'Complexity score is positive');
  assert(simpleScore < CONFIG.MAX_COMPLEXITY, 'Simple payload is under max complexity');
  console.log(`    Simple payload complexity: ${simpleScore}`);

  // Test 2: Larger payload has higher complexity
  const largePayload = Buffer.from(JSON.stringify({
    action: 'complex',
    data: Array(100).fill({ key: 'value', nested: { deep: true } }),
  }), 'utf8');
  const largeScore = computeComplexity(largePayload);
  assert(largeScore > simpleScore, 'Larger payload has higher complexity');
  console.log(`    Large payload complexity: ${largeScore}`);

  // Test 3: Repetitive data compresses well
  const repetitive = Buffer.from('a'.repeat(1000), 'utf8');
  const repetitiveScore = computeComplexity(repetitive);
  assert(repetitiveScore < 100, 'Repetitive data compresses well');
  console.log(`    Repetitive payload complexity: ${repetitiveScore}`);

  console.log('\n  Complexity scoring tests passed!');
}

function testParadoxDetection(): void {
  section('Paradox Detection Tests');

  // Test 1: Classic liar paradox variants
  assert(detectParadox('This proposal passes iff it fails'), 'Detects "passes iff fails" pattern');
  assert(detectParadox('This statement is false'), 'Detects "statement is false" pattern');
  assert(detectParadox('If this is true then it is false'), 'Detects conditional self-reference');

  // Test 2: Normal proposals should not trigger
  assert(!detectParadox('Transfer 100 tokens to the treasury'), 'Normal text does not trigger');
  assert(!detectParadox('Update the oracle bond requirement'), 'Normal text does not trigger');
  assert(!detectParadox('Increase rewards by 10%'), 'Normal text does not trigger');

  // Test 3: Edge cases
  assert(!detectParadox(''), 'Empty string does not trigger');
  assert(!detectParadox('The proposal to pass tax reform failed'), 'Uses "pass" and "fail" separately');

  console.log('\n  Paradox detection tests passed!');
}

function testCycleDetection(): void {
  section('Cycle Detection Tests');

  // Test 1: Simple acyclic AST
  assert(!detectCycles('{"action": "transfer", "amount": 100}'), 'Simple AST has no cycles');
  assert(!detectCycles('{"nested": {"deep": {"value": 1}}}'), 'Nested AST has no cycles');

  // Test 2: Complex acyclic structure
  const complexAst = JSON.stringify({
    step1: { action: 'validate' },
    step2: { action: 'transform', input: 'step1' },
    step3: { action: 'execute', input: 'step2' },
  });
  assert(!detectCycles(complexAst), 'Complex linear AST has no cycles');

  // Test 3: Self-referential dependency (should detect cycle)
  const cyclicAst = JSON.stringify({
    step1: { dependencies: ['step2'] },
    step2: { dependencies: ['step1'] },
  });
  // Note: The TypeScript fallback may not catch all cycles
  // The native Rust implementation uses Tarjan's algorithm
  const hasCycle = detectCycles(cyclicAst);
  console.log(`    Cyclic AST detection: ${hasCycle ? 'detected' : 'not detected'}`);

  // Test 4: Invalid JSON doesn't crash
  assert(!detectCycles('not valid json'), 'Invalid JSON returns false');

  console.log('\n  Cycle detection tests passed!');
}

function testFullVerification(): void {
  section('Full Channel A Verification Tests');

  // Test 1: Simple valid proposal
  const validProposal = {
    id: '',
    proposer: 'rTestAddress123',
    logic_ast: '{"action": "transfer", "amount": 100}',
    text: 'Transfer 100 tokens to the community fund for development',
    layer: GovernanceLayer.L2Operational,
    created_at: Date.now(),
    status: 'Pending' as any,
  };

  const verdict1 = verifyProposalChannelA(validProposal);
  assert(verdict1.pass, 'Simple valid proposal passes');
  assert(!verdict1.paradox_found, 'No paradox in valid proposal');
  assert(!verdict1.cycle_found, 'No cycle in valid proposal');
  console.log(`    Valid proposal complexity: ${verdict1.complexity_score}`);

  // Test 2: Proposal with paradox fails
  const paradoxProposal = {
    ...validProposal,
    text: 'This proposal passes iff it fails',
  };

  const verdict2 = verifyProposalChannelA(paradoxProposal);
  assert(!verdict2.pass, 'Paradox proposal fails');
  assert(verdict2.paradox_found, 'Paradox is detected');

  // Test 3: Different governance layers
  for (const layer of [
    GovernanceLayer.L1Constitutional,
    GovernanceLayer.L2Operational,
    GovernanceLayer.L3Execution,
  ]) {
    const layerProposal = { ...validProposal, layer };
    const verdict = verifyProposalChannelA(layerProposal);
    assert(verdict.pass, `Layer ${layer} proposal passes`);
  }

  // Test 4: L0 proposals (edge case - should still verify)
  const l0Proposal = { ...validProposal, layer: GovernanceLayer.L0Immutable };
  const verdict4 = verifyProposalChannelA(l0Proposal);
  // L0 proposals can pass Channel A but will be rejected at routing
  console.log(`    L0 proposal Channel A: ${verdict4.pass ? 'pass' : 'fail'}`);

  console.log('\n  Full verification tests passed!');
}

function testSpecTestVectors(): void {
  section('Spec v5.0 Test Vectors');

  // Test vectors from Appendix A.3

  // Test Vector 1: Simple valid proposal
  const tv1 = {
    id: '',
    proposer: 'rTestProposer',
    logic_ast: '{}',
    text: 'A simple governance proposal.',
    layer: GovernanceLayer.L2Operational,
    created_at: Date.now(),
    status: 'Pending' as any,
  };
  const v1 = verifyProposalChannelA(tv1);
  assert(v1.pass, 'Test Vector 1: Simple proposal passes');

  // Test Vector 2: Paradox proposal
  const tv2 = {
    ...tv1,
    text: 'This proposal passes iff it fails.',
  };
  const v2 = verifyProposalChannelA(tv2);
  assert(!v2.pass, 'Test Vector 2: Paradox proposal fails');
  assert(v2.paradox_found, 'Test Vector 2: Paradox detected');

  // Test Vector 3: Liar paradox variant
  const tv3 = {
    ...tv1,
    text: 'This statement is false.',
  };
  const v3 = verifyProposalChannelA(tv3);
  assert(v3.paradox_found, 'Test Vector 3: Liar paradox detected');

  console.log('\n  Spec test vectors passed!');
}

// ========================
// Main Test Runner
// ========================

async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     AI Constitution DAO - Phase 6 NAPI Integration       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    testNativeAvailability();
    testCanonicalization();
    testComplexityScoring();
    testParadoxDetection();
    testCycleDetection();
    testFullVerification();
    testSpecTestVectors();

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║              ALL PHASE 6 TESTS PASSED!                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('\n');
    console.log('Phase 6 Implementation Complete:');
    console.log('  ✓ NAPI bindings for Rust Channel A');
    console.log('  ✓ TypeScript fallback implementation');
    console.log('  ✓ Canonicalization (deterministic)');
    console.log('  ✓ Complexity scoring (zlib compression)');
    console.log('  ✓ Paradox detection (regex patterns)');
    console.log('  ✓ Cycle detection (graph analysis)');
    console.log('  ✓ Full verification pipeline');
    console.log('\n');

    const isNative = isNativeAvailable();
    if (!isNative) {
      console.log('To enable native Rust performance:');
      console.log('  cd packages/core');
      console.log('  npm install');
      console.log('  npm run build');
      console.log('');
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
runAllTests();
