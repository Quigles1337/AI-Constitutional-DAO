/**
 * Channel A: Deterministic Hard Gate
 *
 * This module provides Channel A verification, which performs computationally
 * reproducible checks. Its verdicts are binary (PASS/FAIL) and act as a hard
 * gate on proposals.
 *
 * When the native @ai-constitution-dao/core module is available, it uses
 * Rust for high-performance verification. Otherwise, it falls back to a
 * TypeScript implementation.
 */

import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { ChannelAVerdict, GovernanceLayer, Proposal, CONFIG } from '../types';

// Try to load native bindings
let nativeCore: NativeCore | null = null;

interface NativeCore {
  verifyProposal(
    proposer: string,
    logicAst: string,
    text: string,
    layer: string
  ): {
    pass: boolean;
    complexityScore: number;
    paradoxFound: boolean;
    cycleFound: boolean;
  };
  canonicalizeProposal(
    proposer: string,
    logicAst: string,
    text: string,
    layer: string
  ): {
    payloadHex: string;
    hash: string;
    length: number;
  };
  computeComplexityScore(payloadHex: string): number;
  detectParadoxInText(text: string): boolean;
  detectCyclesInAst(logicAst: string): boolean;
  calculateFriction(alignmentScore: number): {
    requiredQuorum: number;
    timelockDuration: number;
    alignmentScore: number;
    quorumMultiplier: number;
    timelockMultiplier: number;
  };
  getMaxComplexity(): number;
}

try {
  // Try to load the native Rust module
  nativeCore = require('@ai-constitution-dao/core') as NativeCore;
  console.log('Channel A: Using native Rust implementation');
} catch {
  console.log('Channel A: Using TypeScript fallback implementation');
}

/**
 * Check if native bindings are available
 */
export function isNativeAvailable(): boolean {
  return nativeCore !== null;
}

/**
 * Canonical payload from canonicalization
 */
export interface CanonicalPayload {
  bytes: Buffer;
  hash: string;
}

/**
 * Canonicalize a proposal into a deterministic representation
 *
 * Process:
 * 1. Parse and sort AST JSON alphabetically
 * 2. Normalize text: lowercase, remove punctuation, single spaces
 * 3. Combine: ast_json + "." + normalized_text
 * 4. Compute SHA-256 hash
 */
export function canonicalize(proposal: Proposal): CanonicalPayload {
  if (nativeCore) {
    const result = nativeCore.canonicalizeProposal(
      proposal.proposer,
      proposal.logic_ast,
      proposal.text,
      governanceLayerToString(proposal.layer)
    );
    return {
      bytes: Buffer.from(result.payloadHex, 'hex'),
      hash: result.hash,
    };
  }

  // TypeScript fallback
  // Step 1: Parse and sort AST keys
  const ast = JSON.parse(proposal.logic_ast);
  const sortedAst = sortObjectKeys(ast);
  const astJson = JSON.stringify(sortedAst);

  // Step 2: Normalize text
  const normalizedText = proposal.text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Step 3: Combine
  const payload = astJson + '.' + normalizedText;
  const bytes = Buffer.from(payload, 'utf8');

  // Step 4: Hash
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');

  return { bytes, hash };
}

/**
 * Compute complexity score using zlib compression
 */
export function computeComplexity(payload: Buffer | string): number {
  if (nativeCore && typeof payload === 'string') {
    return nativeCore.computeComplexityScore(payload);
  }

  // TypeScript fallback
  const bytes = typeof payload === 'string' ? Buffer.from(payload, 'hex') : payload;
  const compressed = zlib.deflateSync(bytes, { level: 9 });
  return compressed.length;
}

/**
 * Detect paradoxes in proposal text using regex patterns
 */
export function detectParadox(text: string): boolean {
  if (nativeCore) {
    return nativeCore.detectParadoxInText(text);
  }

  // TypeScript fallback with pattern matching
  const patterns = [
    /(?:this proposal|the motion).*(?:passes|fails)\s*iff.*(?:fails|passes)/i,
    /(?:this rule|the following statement)\s*is\s*false/i,
    /if\s+this.*(?:true|passes).*then.*(?:false|fails)/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Detect cycles in proposal logic AST using graph analysis
 */
export function detectCycles(logicAst: string): boolean {
  if (nativeCore) {
    return nativeCore.detectCyclesInAst(logicAst);
  }

  // TypeScript fallback - simple cycle detection
  try {
    const ast = JSON.parse(logicAst);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function hasCycle(node: any, path: string): boolean {
      if (recursionStack.has(path)) {
        return true;
      }
      if (visited.has(path)) {
        return false;
      }

      visited.add(path);
      recursionStack.add(path);

      // Check for dependencies
      if (node && typeof node === 'object') {
        const deps = node.dependencies || node.deps || node.requires || [];
        for (const dep of Array.isArray(deps) ? deps : []) {
          if (typeof dep === 'string') {
            if (recursionStack.has(dep)) {
              return true;
            }
          }
        }

        // Recursively check child nodes
        for (const key of Object.keys(node)) {
          if (typeof node[key] === 'object' && node[key] !== null) {
            if (hasCycle(node[key], `${path}.${key}`)) {
              return true;
            }
          }
        }
      }

      recursionStack.delete(path);
      return false;
    }

    return hasCycle(ast, 'root');
  } catch {
    return false;
  }
}

/**
 * Verify a proposal through the full Channel A pipeline
 *
 * Process (from spec v5.0):
 * 1. Canonicalize(ProposalTransaction) -> (CanonicalPayloadBytes, CanonicalHash)
 * 2. ComputeComplexity(CanonicalPayloadBytes) -> complexity_score
 * 3. DetectParadox(CanonicalPayloadBytes) -> paradox_found
 * 4. DetectCycles(CanonicalPayloadBytes) -> cycle_found
 * 5. If complexity_score > MAX_COMPLEXITY OR paradox_found OR cycle_found: FAIL
 * 6. Else: PASS
 */
export function verifyProposal(proposal: Proposal): ChannelAVerdict {
  if (nativeCore) {
    const result = nativeCore.verifyProposal(
      proposal.proposer,
      proposal.logic_ast,
      proposal.text,
      governanceLayerToString(proposal.layer)
    );
    return {
      pass: result.pass,
      complexity_score: result.complexityScore,
      paradox_found: result.paradoxFound,
      cycle_found: result.cycleFound,
    };
  }

  // TypeScript fallback
  try {
    // Step 1: Canonicalize
    const canonical = canonicalize(proposal);

    // Step 2: Compute complexity
    const complexity_score = computeComplexity(canonical.bytes);

    // Step 3: Detect paradoxes
    const paradox_found = detectParadox(proposal.text);

    // Step 4: Detect cycles
    const cycle_found = detectCycles(proposal.logic_ast);

    // Step 5-6: Determine pass/fail
    const pass =
      complexity_score <= CONFIG.MAX_COMPLEXITY &&
      !paradox_found &&
      !cycle_found;

    return {
      pass,
      complexity_score,
      paradox_found,
      cycle_found,
    };
  } catch (error) {
    // Canonicalization failure is a hard fail
    return {
      pass: false,
      complexity_score: 0,
      paradox_found: false,
      cycle_found: false,
    };
  }
}

// Helper functions

function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
  }
  return obj;
}

function governanceLayerToString(layer: GovernanceLayer): string {
  switch (layer) {
    case GovernanceLayer.L0Immutable:
      return 'L0Immutable';
    case GovernanceLayer.L1Constitutional:
      return 'L1Constitutional';
    case GovernanceLayer.L2Operational:
      return 'L2Operational';
    case GovernanceLayer.L3Execution:
      return 'L3Execution';
    default:
      return 'L2Operational';
  }
}
