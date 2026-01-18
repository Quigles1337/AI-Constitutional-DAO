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
} from '../types';

/**
 * L0 Axioms - The immutable core principles of the DAO
 * These cannot be modified and serve as the foundation for alignment scoring
 */
const L0_AXIOMS = `
1. Do No Harm: The network shall not enable actions that cause direct, measurable harm to its participants.
2. Preserve Decentralization: No single entity or coordinated group should be able to control more than 33% of governance power.
3. Maintain Economic Fairness: Economic mechanisms must not systematically disadvantage any class of participants.
4. Protect Minority Rights: Proposals that would permanently disenfranchise any minority group require supermajority approval.
5. Ensure Transparency: All governance actions must be publicly verifiable and auditable.
`;

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
   * @param proposal The proposal to analyze
   * @returns Channel B verdict with alignment score and decidability class
   */
  async analyze(proposal: Proposal | ProposalInput & { layer: string }): Promise<ChannelBVerdict> {
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

      return {
        semantic_alignment_score: Math.max(0, Math.min(1, result.alignment_score)),
        decidability_class: this.parseDecidabilityClass(result.decidability_class),
        reasoning: result.reasoning,
      };
    } catch (error) {
      console.error('Channel B analysis error:', error);
      // On error, return conservative defaults
      return {
        semantic_alignment_score: 0.5,
        decidability_class: DecidabilityClass.III, // Require human review on error
        reasoning: 'Analysis failed - defaulting to human review',
      };
    }
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
