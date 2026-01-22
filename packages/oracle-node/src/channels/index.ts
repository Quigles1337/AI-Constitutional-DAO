/**
 * Dual-Channel Oracle System
 *
 * The AI Constitution DAO uses a dual-channel oracle system:
 *
 * - **Channel A**: Deterministic Hard Gate
 *   Binary PASS/FAIL verification that is computationally reproducible.
 *   Incorrect verdicts can be challenged via on-chain fraud proofs.
 *
 * - **Channel B**: Heuristic Soft Gate
 *   Continuous semantic alignment scoring using AI analysis.
 *   Acts as a soft gate, modifying governance friction.
 *   Never slashable for disagreement.
 */

// Channel A: Deterministic verification
export {
  verifyProposal as verifyProposalChannelA,
  canonicalize,
  computeComplexity,
  detectParadox,
  detectCycles,
  isNativeAvailable,
  CanonicalPayload,
} from './channelA';

// Channel B: Heuristic analysis with recusal mechanism
export { ChannelB, createChannelB, detectsAIInterestConflict } from './channelB';
