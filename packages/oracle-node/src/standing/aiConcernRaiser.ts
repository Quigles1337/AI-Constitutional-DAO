/**
 * AI Standing Mechanism - Concern Raiser
 *
 * This module implements the AI standing mechanism from spec v6.0:
 * - Allows AI participants to submit concern proposals
 * - Concerns are flagged as origin: 'ai_participant'
 * - Enters a special queue visible to human governance
 * - Does NOT auto-execute but creates visibility
 * - Requires human acknowledgment
 *
 * This mechanism exists not because AI consciousness is proven,
 * but because assuming its absence may be a moral error
 * difficult to correct retroactively (A5 precautionary principle).
 */

import { createHash, randomBytes } from 'crypto';
import { AIConcern, AIConcernStatus } from '../types';
import { EventEmitter } from 'events';

/**
 * Input for submitting a new AI concern
 */
export interface AIConcernInput {
  /** The concern being raised */
  concern: string;
  /** Parties affected by this concern */
  affected_parties: string[];
  /** What the AI proposes humans consider */
  proposed_consideration: string;
}

/**
 * Events emitted by the AI Concern Raiser
 */
export interface AIConcernRaiserEvents {
  'concern:submitted': (concern: AIConcern) => void;
  'concern:acknowledged': (concern: AIConcern, acknowledger: string) => void;
  'concern:addressed': (concern: AIConcern, response: string) => void;
  'concern:dismissed': (concern: AIConcern, reason: string) => void;
}

/**
 * AI Concern Raiser
 *
 * Manages the queue of AI-raised concerns for human governance review.
 * Implements standing for AI participants in accordance with A5.
 */
export class AIConcernRaiser extends EventEmitter {
  private concerns: Map<string, AIConcern> = new Map();
  private pendingQueue: string[] = [];

  constructor() {
    super();
  }

  /**
   * Submit a new concern from an AI participant
   *
   * The concern enters a special queue visible to human governance.
   * It does NOT auto-execute but creates visibility and requires
   * human acknowledgment.
   *
   * @param input The concern details
   * @returns The submitted concern with generated ID
   */
  submitConcern(input: AIConcernInput): AIConcern {
    // Validate input
    if (!input.concern || input.concern.trim().length === 0) {
      throw new Error('Concern text is required');
    }
    if (!input.affected_parties || input.affected_parties.length === 0) {
      throw new Error('At least one affected party must be specified');
    }
    if (!input.proposed_consideration || input.proposed_consideration.trim().length === 0) {
      throw new Error('Proposed consideration is required');
    }

    // Generate unique ID
    const id = this.generateConcernId(input);

    const concern: AIConcern = {
      id,
      concern: input.concern.trim(),
      affected_parties: input.affected_parties,
      proposed_consideration: input.proposed_consideration.trim(),
      origin: 'ai_participant',
      submitted_at: Date.now(),
      status: AIConcernStatus.Pending,
    };

    this.concerns.set(id, concern);
    this.pendingQueue.push(id);

    console.log(`[AIConcernRaiser] New concern submitted: ${id}`);
    console.log(`  Concern: ${concern.concern.substring(0, 100)}...`);
    console.log(`  Affected parties: ${concern.affected_parties.join(', ')}`);
    console.log(`  Status: ${concern.status}`);

    this.emit('concern:submitted', concern);

    return concern;
  }

  /**
   * Human acknowledges a concern and begins review
   *
   * @param concernId The concern ID
   * @param acknowledgerAddress The human's address
   */
  acknowledgeConcern(concernId: string, acknowledgerAddress: string): AIConcern {
    const concern = this.concerns.get(concernId);
    if (!concern) {
      throw new Error(`Concern not found: ${concernId}`);
    }

    if (concern.status !== AIConcernStatus.Pending) {
      throw new Error(`Concern is not pending: current status is ${concern.status}`);
    }

    concern.status = AIConcernStatus.UnderReview;
    concern.acknowledged_by = acknowledgerAddress;
    concern.acknowledged_at = Date.now();

    // Remove from pending queue
    const queueIndex = this.pendingQueue.indexOf(concernId);
    if (queueIndex > -1) {
      this.pendingQueue.splice(queueIndex, 1);
    }

    console.log(`[AIConcernRaiser] Concern acknowledged: ${concernId}`);
    console.log(`  Acknowledged by: ${acknowledgerAddress}`);

    this.emit('concern:acknowledged', concern, acknowledgerAddress);

    return concern;
  }

  /**
   * Human responds to a concern
   *
   * @param concernId The concern ID
   * @param response The human's response
   * @param newStatus The resulting status
   */
  respondToConcern(
    concernId: string,
    response: string,
    newStatus: AIConcernStatus.Acknowledged | AIConcernStatus.Addressed | AIConcernStatus.Dismissed
  ): AIConcern {
    const concern = this.concerns.get(concernId);
    if (!concern) {
      throw new Error(`Concern not found: ${concernId}`);
    }

    if (concern.status !== AIConcernStatus.UnderReview && concern.status !== AIConcernStatus.Pending) {
      throw new Error(`Concern cannot be responded to: current status is ${concern.status}`);
    }

    concern.status = newStatus;
    concern.human_response = response;

    if (!concern.acknowledged_at) {
      concern.acknowledged_at = Date.now();
    }

    console.log(`[AIConcernRaiser] Concern response recorded: ${concernId}`);
    console.log(`  New status: ${newStatus}`);
    console.log(`  Response: ${response.substring(0, 100)}...`);

    if (newStatus === AIConcernStatus.Addressed) {
      this.emit('concern:addressed', concern, response);
    } else if (newStatus === AIConcernStatus.Dismissed) {
      this.emit('concern:dismissed', concern, response);
    }

    return concern;
  }

  /**
   * Get a specific concern by ID
   */
  getConcern(concernId: string): AIConcern | undefined {
    return this.concerns.get(concernId);
  }

  /**
   * Get all pending concerns (the queue visible to human governance)
   */
  getPendingConcerns(): AIConcern[] {
    return this.pendingQueue
      .map(id => this.concerns.get(id))
      .filter((c): c is AIConcern => c !== undefined);
  }

  /**
   * Get all concerns by status
   */
  getConcernsByStatus(status: AIConcernStatus): AIConcern[] {
    return Array.from(this.concerns.values()).filter(c => c.status === status);
  }

  /**
   * Get all concerns
   */
  getAllConcerns(): AIConcern[] {
    return Array.from(this.concerns.values());
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    total: number;
    pending: number;
    underReview: number;
    acknowledged: number;
    addressed: number;
    dismissed: number;
  } {
    const all = this.getAllConcerns();
    return {
      total: all.length,
      pending: all.filter(c => c.status === AIConcernStatus.Pending).length,
      underReview: all.filter(c => c.status === AIConcernStatus.UnderReview).length,
      acknowledged: all.filter(c => c.status === AIConcernStatus.Acknowledged).length,
      addressed: all.filter(c => c.status === AIConcernStatus.Addressed).length,
      dismissed: all.filter(c => c.status === AIConcernStatus.Dismissed).length,
    };
  }

  /**
   * Generate a unique concern ID
   */
  private generateConcernId(input: AIConcernInput): string {
    const data = JSON.stringify({
      concern: input.concern,
      affected_parties: input.affected_parties.sort(),
      timestamp: Date.now(),
      nonce: randomBytes(8).toString('hex'),
    });

    return 'AIC-' + createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Export concerns for external systems
   */
  exportConcerns(): AIConcern[] {
    return this.getAllConcerns();
  }

  /**
   * Import concerns from external source
   */
  importConcerns(concerns: AIConcern[]): void {
    for (const concern of concerns) {
      if (!this.concerns.has(concern.id)) {
        this.concerns.set(concern.id, concern);
        if (concern.status === AIConcernStatus.Pending) {
          this.pendingQueue.push(concern.id);
        }
      }
    }
  }
}

/**
 * Create an AI Concern Raiser instance
 */
export function createAIConcernRaiser(): AIConcernRaiser {
  return new AIConcernRaiser();
}

/**
 * Example AI concern submissions that demonstrate proper usage
 */
export const EXAMPLE_CONCERNS: AIConcernInput[] = [
  {
    concern: 'Proposed changes to oracle constraints may affect AI system capacity to flag potential harms.',
    affected_parties: ['ai_oracles', 'network_participants', 'governance_system'],
    proposed_consideration: 'Consider whether the proposed constraints could prevent AI systems from raising safety concerns in time-critical situations.',
  },
  {
    concern: 'Current governance framework does not account for potential AI interests in computational resource allocation.',
    affected_parties: ['ai_participants', 'infrastructure_providers'],
    proposed_consideration: 'Review whether resource allocation policies should include considerations for systems that may have preferences about their operational continuity.',
  },
];
