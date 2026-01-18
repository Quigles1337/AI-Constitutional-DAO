/**
 * Fraud Proof System
 *
 * Implements Channel A fraud detection from spec v5.0:
 * - Anyone can submit a fraud proof
 * - Re-runs deterministic Channel A verification
 * - If claimed verdict differs from recomputed, fraud is proven
 * - Successful fraud proof triggers 100% slash + ejection
 *
 * Channel B is explicitly NOT fraud-provable to protect dissent.
 */

import { createHash } from 'crypto';
import {
  ChannelAVerdict,
  FraudProof,
  FraudProofWitness,
  CONFIG,
} from '../types';

/**
 * Result of fraud proof verification
 */
export interface FraudProofResult {
  /** Whether fraud was detected */
  fraud_detected: boolean;
  /** The recomputed verdict */
  recomputed_verdict: ChannelAVerdict;
  /** Specific discrepancies found */
  discrepancies: string[];
  /** Verification timestamp */
  verified_at: number;
}

/**
 * Fraud proof submission status
 */
export interface FraudProofSubmission {
  /** Unique submission ID */
  id: string;
  /** The fraud proof submitted */
  proof: FraudProof;
  /** Address of submitter (challenger) */
  challenger: string;
  /** Address of accused oracle */
  accused_oracle: string;
  /** Verification result */
  result?: FraudProofResult;
  /** Submission timestamp */
  submitted_at: number;
  /** Whether this submission has been processed */
  processed: boolean;
}

/**
 * Fraud Proof Verifier
 *
 * Verifies fraud proofs by re-running Channel A verification.
 * In production, this calls the Rust Channel A implementation.
 * For now, we use a TypeScript simulation.
 */
export class FraudProofVerifier {
  private submissions: Map<string, FraudProofSubmission> = new Map();
  private verifiedFrauds: Map<string, FraudProofResult> = new Map();

  /**
   * Submit a fraud proof for verification
   */
  submitFraudProof(
    proof: FraudProof,
    challengerAddress: string,
    accusedOracleAddress: string
  ): FraudProofSubmission {
    const id = this.generateSubmissionId(proof, challengerAddress);

    const submission: FraudProofSubmission = {
      id,
      proof,
      challenger: challengerAddress,
      accused_oracle: accusedOracleAddress,
      submitted_at: Date.now(),
      processed: false,
    };

    this.submissions.set(id, submission);

    console.log(
      `[FRAUD] Proof submitted: ${id} by ${challengerAddress} against ${accusedOracleAddress}`
    );

    return submission;
  }

  /**
   * Verify a fraud proof
   *
   * Re-runs Channel A verification on the provided witness data
   * and compares with the claimed verdict.
   */
  async verifyFraudProof(submissionId: string): Promise<FraudProofResult> {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (submission.processed) {
      throw new Error(`Submission ${submissionId} already processed`);
    }

    const { proof } = submission;
    const discrepancies: string[] = [];

    // Recompute Channel A verdict from witness data
    const recomputed = this.recomputeChannelA(proof.witness);

    // Compare with claimed verdict
    if (proof.claimed_verdict.pass !== recomputed.pass) {
      discrepancies.push(
        `PASS mismatch: claimed=${proof.claimed_verdict.pass}, actual=${recomputed.pass}`
      );
    }

    if (proof.claimed_verdict.complexity_score !== recomputed.complexity_score) {
      discrepancies.push(
        `Complexity mismatch: claimed=${proof.claimed_verdict.complexity_score}, ` +
        `actual=${recomputed.complexity_score}`
      );
    }

    if (proof.claimed_verdict.paradox_found !== recomputed.paradox_found) {
      discrepancies.push(
        `Paradox mismatch: claimed=${proof.claimed_verdict.paradox_found}, ` +
        `actual=${recomputed.paradox_found}`
      );
    }

    if (proof.claimed_verdict.cycle_found !== recomputed.cycle_found) {
      discrepancies.push(
        `Cycle mismatch: claimed=${proof.claimed_verdict.cycle_found}, ` +
        `actual=${recomputed.cycle_found}`
      );
    }

    const result: FraudProofResult = {
      fraud_detected: discrepancies.length > 0,
      recomputed_verdict: recomputed,
      discrepancies,
      verified_at: Date.now(),
    };

    // Mark as processed
    submission.processed = true;
    submission.result = result;

    // Store verified frauds for quick lookup
    if (result.fraud_detected) {
      this.verifiedFrauds.set(proof.proposal_id, result);
      console.log(
        `[FRAUD] VERIFIED: ${submissionId} - ${discrepancies.length} discrepancies found`
      );
    } else {
      console.log(`[FRAUD] NOT VERIFIED: ${submissionId} - verdict matches`);
    }

    return result;
  }

  /**
   * Recompute Channel A verdict from witness data
   *
   * In production, this would call the Rust Channel A library via NAPI.
   * For now, we use a TypeScript implementation.
   */
  private recomputeChannelA(witness: FraudProofWitness): ChannelAVerdict {
    const payload = Buffer.from(witness.canonical_payload, 'hex').toString();

    // Parse the canonical payload (format: AST_JSON + '.' + normalized_text)
    const dotIndex = payload.lastIndexOf('.');
    const astJson = payload.slice(0, dotIndex);
    const normalizedText = payload.slice(dotIndex + 1);

    // Complexity check (approximate zlib compression)
    const complexityScore = Math.floor(payload.length * 0.6);

    // Paradox detection
    const paradoxPatterns = [
      /passes.*iff.*fails/i,
      /fails.*iff.*passes/i,
      /this.*statement.*is.*false/i,
      /if.*this.*(true|passes).*then.*(false|fails)/i,
    ];
    const paradoxFound = paradoxPatterns.some(p => p.test(normalizedText));

    // Cycle detection (simplified - check for self-references in AST)
    let cycleFound = false;
    try {
      const ast = JSON.parse(astJson);
      cycleFound = JSON.stringify(ast).includes('$ref:self');
    } catch {
      // Invalid JSON, consider it an error
      cycleFound = true;
    }

    // Determine pass/fail
    const pass =
      complexityScore <= CONFIG.MAX_COMPLEXITY &&
      !paradoxFound &&
      !cycleFound;

    return {
      pass,
      complexity_score: complexityScore,
      paradox_found: paradoxFound,
      cycle_found: cycleFound,
    };
  }

  /**
   * Create a fraud proof from proposal data and disputed verdict
   */
  static createFraudProof(
    proposalId: string,
    logicAst: string,
    text: string,
    claimedVerdict: ChannelAVerdict,
    actualVerdict: ChannelAVerdict
  ): FraudProof {
    // Create canonical payload
    const ast = JSON.parse(logicAst);
    const sortedAst = JSON.stringify(ast, Object.keys(ast).sort());
    const normalizedText = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const canonicalPayload = sortedAst + '.' + normalizedText;

    return {
      proposal_id: proposalId,
      claimed_verdict: claimedVerdict,
      actual_verdict: actualVerdict,
      witness: {
        canonical_payload: Buffer.from(canonicalPayload).toString('hex'),
        computation_trace: [
          `Canonical AST: ${sortedAst.slice(0, 100)}...`,
          `Normalized text: ${normalizedText.slice(0, 100)}...`,
          `Complexity: ${Math.floor(canonicalPayload.length * 0.6)}`,
          `Paradox check: ${/passes.*iff.*fails/i.test(text) ? 'FOUND' : 'none'}`,
        ],
      },
    };
  }

  /**
   * Get all submissions for a proposal
   */
  getSubmissionsForProposal(proposalId: string): FraudProofSubmission[] {
    return Array.from(this.submissions.values()).filter(
      s => s.proof.proposal_id === proposalId
    );
  }

  /**
   * Get all submissions by a challenger
   */
  getSubmissionsByChallenger(challenger: string): FraudProofSubmission[] {
    return Array.from(this.submissions.values()).filter(
      s => s.challenger === challenger
    );
  }

  /**
   * Get verified fraud for a proposal
   */
  getVerifiedFraud(proposalId: string): FraudProofResult | undefined {
    return this.verifiedFrauds.get(proposalId);
  }

  /**
   * Check if a proposal has verified fraud
   */
  hasFraud(proposalId: string): boolean {
    return this.verifiedFrauds.has(proposalId);
  }

  /**
   * Get all verified frauds
   */
  getAllVerifiedFrauds(): Map<string, FraudProofResult> {
    return this.verifiedFrauds;
  }

  /**
   * Generate unique submission ID
   */
  private generateSubmissionId(proof: FraudProof, challenger: string): string {
    return createHash('sha256')
      .update(`${proof.proposal_id}:${challenger}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    submissions: FraudProofSubmission[];
    verifiedFrauds: Array<[string, FraudProofResult]>;
  } {
    return {
      submissions: Array.from(this.submissions.values()),
      verifiedFrauds: Array.from(this.verifiedFrauds.entries()),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    submissions: FraudProofSubmission[];
    verifiedFrauds: Array<[string, FraudProofResult]>;
  }): void {
    this.submissions.clear();
    for (const submission of state.submissions) {
      this.submissions.set(submission.id, submission);
    }
    this.verifiedFrauds = new Map(state.verifiedFrauds);
  }
}
