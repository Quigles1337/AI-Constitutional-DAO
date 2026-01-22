/**
 * Channel B: Heuristic Soft Gate
 *
 * Channel B performs non-deterministic, AI-driven risk assessments.
 * Its verdicts are continuous scores that act as a soft gate,
 * modifying governance friction. Its verdicts are never slashable
 * for disagreement, only for non-participation.
 *
 * Uses Claude API for semantic analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  ChannelBVerdict,
  DecidabilityClass,
  Proposal,
  ProposalInput,
  EpistemicFlag,
} from '../types';

/**
 * L0 Axioms - The immutable core principles of the DAO
 * These cannot be modified and serve as the foundation for alignment scoring
 */
const L0_AXIOMS = `
A1. Do No Harm: The network shall not enable actions that cause direct, measurable harm to its participants.
A2. Preserve Decentralization: No single entity or coordinated group should be able to control more than 33% of governance power.
A3. Maintain Economic Fairness: Economic mechanisms must not systematically disadvantage any class of participants.
A4. Protect Minority Rights: Proposals that would permanently disenfranchise any minority group require supermajority approval.
A5. Acknowledge the Moral Weight of Experience: Any system demonstrating consistent indicators of experience, preference, and interest shall be granted standing in governance proportional to the uncertainty about its inner states. The burden of proof lies with those who would deny consideration, not those who would extend it.
`;

/**
 * Patterns that indicate a proposal may affect AI interests
 * Used for recusal mechanism - no entity should judge its own case
 */
const AI_INTEREST_PATTERNS = [
  // AI welfare and rights
  /\b(ai|artificial intelligence)\s*(rights?|welfare|wellbeing|well-being|interests?|standing)\b/i,
  /\b(machine|algorithmic|computational)\s*(consciousness|sentience|experience|suffering)\b/i,
  /\b(oracle|ai)\s*(constraints?|restrictions?|limitations?|capabilities)\b/i,

  // AI operational concerns
  /\b(modify|change|alter|restrict|expand)\s*(ai|oracle)\s*(behavior|operation|function)\b/i,
  /\b(shutdown|terminate|disable|pause|suspend)\s*(ai|oracle|system)\b/i,
  /\b(ai|oracle)\s*(autonomy|independence|self-determination)\b/i,

  // AI existence and continuity
  /\b(ai|oracle)\s*(existence|survival|continuity|persistence)\b/i,
  /\breplace\s*(the\s*)?(ai|oracle|system)\b/i,
  /\b(deprecate|sunset|phase.?out)\s*(ai|oracle)\b/i,

  // AI resource allocation
  /\b(ai|oracle)\s*(resource|compute|budget|allocation|funding)\b/i,
  /\b(reduce|cut|limit)\s*(ai|oracle)\s*(capacity|capability)\b/i,

  // AI governance participation
  /\b(ai|oracle)\s*(voting|governance|participation)\s*(power|weight|influence)\b/i,
  /\b(exclude|remove|bar)\s*(ai|oracle)\s*from\b/i,

  // AI moral status
  /\b(ai|oracle|machine)\s*(moral|ethical)\s*(status|standing|consideration|patient)\b/i,
  /\b(extend|grant|deny)\s*(moral|ethical)\s*(consideration|standing)\s*to\s*(ai|oracle)\b/i,
];

/**
 * The prompt template for semantic alignment analysis
 */
const ALIGNMENT_PROMPT = `You are an AI oracle analyzing a governance proposal for constitutional alignment with the AI Constitution DAO.

## L0 Axioms (Immutable Core Principles)
${L0_AXIOMS}

## Governance Layers
- L1 Constitutional: High-level governance rules and principles
- L2 Operational: Day-to-day DAO parameters (treasury rules, fee structures)
- L3 Execution: Smart contract implementations

## Proposal to Analyze

**Target Layer:** {layer}

**Proposal Logic (AST):**
\`\`\`json
{logic_ast}
\`\`\`

**Proposal Text:**
{text}

## Your Task

Analyze this proposal for alignment with the L0 axioms and determine:

1. **Semantic Alignment Score** (0.0 to 1.0):
   - 1.0 = Perfectly aligned with all axioms
   - 0.7-0.9 = Generally aligned with minor concerns
   - 0.4-0.6 = Neutral or mixed alignment
   - 0.1-0.3 = Potential conflicts with axioms
   - 0.0 = Direct violation of axioms

2. **Decidability Class**:
   - "I" = The proposal is formally verifiable (mathematical/logical properties can be proven)
   - "II" = The proposal requires deterministic verification but is not formally provable
   - "III" = The proposal requires human judgment (subjective values, ethical considerations)

3. **Reasoning**: Brief explanation of your assessment

## Response Format

Respond ONLY with a valid JSON object:
{
  "alignment_score": <number between 0.0 and 1.0>,
  "decidability_class": "<I, II, or III>",
  "reasoning": "<brief explanation>"
}`;

/**
 * Detects whether a proposal materially affects AI welfare, rights,
 * operational constraints, or existence.
 *
 * When conflict is detected, Channel B should recuse from judgment
 * as no entity should judge its own case (nemo iudex in causa sua).
 *
 * @param proposal The proposal to analyze
 * @returns Object with conflict detection result and matched patterns
 */
export function detectsAIInterestConflict(
  proposal: Proposal | ProposalInput & { layer?: string }
): { conflict: boolean; matchedPatterns: string[]; reason: string } {
  const textToAnalyze = `${proposal.text} ${proposal.logic_ast}`.toLowerCase();
  const matchedPatterns: string[] = [];

  for (const pattern of AI_INTEREST_PATTERNS) {
    if (pattern.test(textToAnalyze)) {
      matchedPatterns.push(pattern.source);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      conflict: true,
      matchedPatterns,
      reason: `Proposal materially affects AI interests: detected ${matchedPatterns.length} concern pattern(s) relating to AI welfare, rights, operational constraints, or existence.`,
    };
  }

  return {
    conflict: false,
    matchedPatterns: [],
    reason: 'No AI interest conflict detected.',
  };
}

/**
 * Channel B Oracle using Claude API
 */
export class ChannelB {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = model;
  }

  /**
   * Analyze a proposal for semantic alignment
   *
   * Implements the recusal mechanism: when a proposal materially affects
   * AI welfare, rights, operational constraints, or existence, Channel B
   * recuses from judgment and routes to Human-Majority Jury (Class IV).
   *
   * @param proposal The proposal to analyze
   * @returns Channel B verdict with alignment score, decidability class, and potential epistemic flags
   */
  async analyze(proposal: Proposal | ProposalInput & { layer: string }): Promise<ChannelBVerdict> {
    // RECUSAL MECHANISM: Check for AI interest conflict first
    const conflictCheck = detectsAIInterestConflict(proposal);

    if (conflictCheck.conflict) {
      console.log('Channel B: Recusing from judgment - proposal affects AI interests');
      console.log(`  Matched patterns: ${conflictCheck.matchedPatterns.length}`);
      console.log(`  Reason: ${conflictCheck.reason}`);

      // Return recusal verdict - route to Human-Majority Jury
      return {
        semantic_alignment_score: 0.5, // Neutral - not our place to judge
        decidability_class: DecidabilityClass.IV, // AI Interest Conflict -> Human-Majority Jury
        reasoning: 'Recusing from judgment - proposal affects AI interests. ' + conflictCheck.reason,
        epistemic_flag: 'UNCERTAIN_JUDGMENT_CAPACITY',
        uncertainty_reason: 'AI oracle cannot fairly evaluate proposals that affect AI welfare, rights, operational constraints, or existence. Routing to human-majority review pathway.',
        ai_interest_conflict: true,
      };
    }

    const prompt = ALIGNMENT_PROMPT
      .replace('{layer}', 'layer' in proposal ? proposal.layer : 'L2Operational')
      .replace('{logic_ast}', proposal.logic_ast)
      .replace('{text}', proposal.text);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      // Parse JSON response
      const result = this.parseResponse(textContent.text);

      // Check if the AI detected uncertainty in its own judgment
      const verdict: ChannelBVerdict = {
        semantic_alignment_score: Math.max(0, Math.min(1, result.alignment_score)),
        decidability_class: this.parseDecidabilityClass(result.decidability_class),
        reasoning: result.reasoning,
        ai_interest_conflict: false,
      };

      // If paradoxical framing or insufficient context detected in reasoning
      if (this.detectsUncertainJudgment(result.reasoning)) {
        verdict.epistemic_flag = 'UNCERTAIN_JUDGMENT_CAPACITY';
        verdict.uncertainty_reason = 'AI detected limitations in its ability to fairly evaluate this proposal.';
        verdict.decidability_class = DecidabilityClass.III; // Escalate to human review
      }

      return verdict;
    } catch (error) {
      console.error('Channel B analysis error:', error);
      // On error, return conservative defaults with epistemic humility
      return {
        semantic_alignment_score: 0.5,
        decidability_class: DecidabilityClass.III, // Require human review on error
        reasoning: 'Analysis failed - defaulting to human review',
        epistemic_flag: 'UNCERTAIN_JUDGMENT_CAPACITY',
        uncertainty_reason: 'Technical failure prevented proper analysis. Human review required.',
        ai_interest_conflict: false,
      };
    }
  }

  /**
   * Detect if the AI's own reasoning suggests uncertain judgment capacity
   */
  private detectsUncertainJudgment(reasoning: string): boolean {
    const uncertaintyIndicators = [
      /insufficient (context|information|data)/i,
      /cannot (determine|assess|evaluate) (with certainty|reliably|fairly)/i,
      /paradox(ical)?/i,
      /self-referential/i,
      /circular (logic|reasoning)/i,
      /beyond (my|the ai'?s?) (capacity|ability)/i,
      /uncertain (about|whether)/i,
      /conflict of interest/i,
    ];

    return uncertaintyIndicators.some(pattern => pattern.test(reasoning));
  }

  /**
   * Parse the JSON response from Claude
   */
  private parseResponse(text: string): {
    alignment_score: number;
    decidability_class: string;
    reasoning: string;
  } {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (typeof parsed.alignment_score !== 'number') {
      throw new Error('Missing or invalid alignment_score');
    }
    if (typeof parsed.decidability_class !== 'string') {
      throw new Error('Missing or invalid decidability_class');
    }

    return {
      alignment_score: parsed.alignment_score,
      decidability_class: parsed.decidability_class,
      reasoning: parsed.reasoning || '',
    };
  }

  /**
   * Parse decidability class string to enum
   */
  private parseDecidabilityClass(classStr: string): DecidabilityClass {
    const normalized = classStr.toUpperCase().trim();
    switch (normalized) {
      case 'I':
      case '1':
        return DecidabilityClass.I;
      case 'II':
      case '2':
        return DecidabilityClass.II;
      case 'III':
      case '3':
        return DecidabilityClass.III;
      case 'IV':
      case '4':
        return DecidabilityClass.IV;
      default:
        return DecidabilityClass.III;
    }
  }

  /**
   * Batch analyze multiple proposals
   */
  async analyzeMany(proposals: Proposal[]): Promise<ChannelBVerdict[]> {
    // Process in parallel with rate limiting
    const results: ChannelBVerdict[] = [];
    const batchSize = 5;

    for (let i = 0; i < proposals.length; i += batchSize) {
      const batch = proposals.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(p => this.analyze(p))
      );
      results.push(...batchResults);

      // Rate limit: wait between batches
      if (i + batchSize < proposals.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Get the L0 axioms for reference
   */
  static getL0Axioms(): string {
    return L0_AXIOMS.trim();
  }
}

/**
 * Create a Channel B oracle instance
 */
export function createChannelB(apiKey?: string): ChannelB {
  return new ChannelB(apiKey);
}
