/**
 * Decidability Router
 *
 * Routes proposals based on their decidability classification:
 * - Class I: Formally verifiable -> PoUW Marketplace
 * - Class II: Deterministic -> Standard Voting with Friction
 * - Class III: Requires judgment -> Constitutional Jury
 *
 * Also handles layer-based routing for constitutional amendments.
 */

import {
  DecidabilityClass,
  GovernanceLayer,
  ProposalStatus,
  FrictionParams,
  calculateFriction,
  CONFIG,
} from '../types';
import { ProposalState } from '../governance/proposal';

/**
 * Routing decision
 */
export interface RoutingDecision {
  /** The route chosen */
  route: Route;
  /** Friction parameters (for voting routes) */
  friction: FrictionParams;
  /** Reason for this routing */
  reason: string;
  /** Additional requirements */
  requirements: RouteRequirement[];
}

/**
 * Available routes
 */
export enum Route {
  /** Route to PoUW marketplace for formal verification */
  PoUW = 'PoUW',
  /** Standard token-weighted voting */
  StandardVoting = 'StandardVoting',
  /** Constitutional jury (21 members) */
  ConstitutionalJury = 'ConstitutionalJury',
  /** Human-Majority Jury for AI Interest Conflicts (Class IV) */
  HumanMajorityJury = 'HumanMajorityJury',
  /** Immediate rejection (Channel A failure) */
  Rejected = 'Rejected',
  /** Emergency fast-track (for critical fixes) */
  Emergency = 'Emergency',
}

/**
 * Additional requirements for a route
 */
export interface RouteRequirement {
  type: RequirementType;
  value: string;
  description: string;
}

export enum RequirementType {
  /** Minimum quorum required */
  MinQuorum = 'MinQuorum',
  /** Minimum timelock duration */
  MinTimelock = 'MinTimelock',
  /** Requires supermajority */
  Supermajority = 'Supermajority',
  /** Requires jury approval first */
  JuryPreApproval = 'JuryPreApproval',
  /** Requires PoUW verification first */
  PoUWVerification = 'PoUWVerification',
  /** Multiple voting rounds */
  MultiRound = 'MultiRound',
  /** Requires human-majority jury (AI recusal) */
  HumanMajorityRequired = 'HumanMajorityRequired',
  /** AI Interest Conflict flag */
  AIInterestConflict = 'AIInterestConflict',
}

/**
 * Layer-specific requirements
 */
const LAYER_REQUIREMENTS: Record<GovernanceLayer, Partial<FrictionParams>> = {
  [GovernanceLayer.L0Immutable]: {
    // L0 cannot be modified
    required_quorum: 1.0, // Impossible
    timelock_duration: Number.MAX_SAFE_INTEGER,
  },
  [GovernanceLayer.L1Constitutional]: {
    // Constitutional changes need very high friction
    required_quorum: 0.67, // 2/3 supermajority
    timelock_duration: 30 * 24 * 60 * 60, // 30 days
  },
  [GovernanceLayer.L2Operational]: {
    // Operational changes use standard friction
    required_quorum: 0.1,
    timelock_duration: 24 * 60 * 60, // 24 hours base
  },
  [GovernanceLayer.L3Execution]: {
    // Execution layer has lowest friction
    required_quorum: 0.05,
    timelock_duration: 12 * 60 * 60, // 12 hours
  },
};

/**
 * Decidability Router
 */
export class DecidabilityRouter {
  /**
   * Route a proposal based on its decidability class and layer
   */
  route(proposal: ProposalState): RoutingDecision {
    // Check Channel A first - hard rejection
    if (proposal.channel_a_verdict && !proposal.channel_a_verdict.pass) {
      return {
        route: Route.Rejected,
        friction: calculateFriction(0),
        reason: 'Failed Channel A deterministic verification',
        requirements: [],
      };
    }

    // Check for L0 modification attempts
    if (proposal.layer === GovernanceLayer.L0Immutable) {
      return {
        route: Route.Rejected,
        friction: calculateFriction(0),
        reason: 'L0 Immutable layer cannot be modified',
        requirements: [],
      };
    }

    // Get decidability class
    const decidabilityClass = proposal.channel_b_verdict?.decidability_class
      || DecidabilityClass.II;

    // Get alignment score for friction
    const alignmentScore = proposal.channel_b_verdict?.semantic_alignment_score
      || 0.5;

    // Calculate base friction from alignment
    let friction = calculateFriction(alignmentScore);

    // Apply layer-specific requirements
    friction = this.applyLayerRequirements(friction, proposal.layer);

    // Route based on decidability class
    switch (decidabilityClass) {
      case DecidabilityClass.I:
        return this.routeClassI(proposal, friction);
      case DecidabilityClass.II:
        return this.routeClassII(proposal, friction);
      case DecidabilityClass.III:
        return this.routeClassIII(proposal, friction);
      case DecidabilityClass.IV:
        return this.routeClassIV(proposal, friction);
      default:
        return this.routeClassII(proposal, friction);
    }
  }

  /**
   * Route Class I: Formally Verifiable
   */
  private routeClassI(
    proposal: ProposalState,
    friction: FrictionParams
  ): RoutingDecision {
    const requirements: RouteRequirement[] = [
      {
        type: RequirementType.PoUWVerification,
        value: 'required',
        description: 'Must be verified by PoUW marketplace miners',
      },
    ];

    // For L1 changes, also require voting after PoUW
    if (proposal.layer === GovernanceLayer.L1Constitutional) {
      requirements.push({
        type: RequirementType.Supermajority,
        value: '0.67',
        description: 'Requires 2/3 supermajority after PoUW verification',
      });
    }

    return {
      route: Route.PoUW,
      friction,
      reason: 'Class I proposals are formally verifiable via PoUW marketplace',
      requirements,
    };
  }

  /**
   * Route Class II: Deterministic
   */
  private routeClassII(
    proposal: ProposalState,
    friction: FrictionParams
  ): RoutingDecision {
    const requirements: RouteRequirement[] = [
      {
        type: RequirementType.MinQuorum,
        value: friction.required_quorum.toString(),
        description: `Minimum ${(friction.required_quorum * 100).toFixed(1)}% participation`,
      },
      {
        type: RequirementType.MinTimelock,
        value: friction.timelock_duration.toString(),
        description: `${(friction.timelock_duration / 3600).toFixed(1)} hour timelock`,
      },
    ];

    // L1 constitutional changes need supermajority
    if (proposal.layer === GovernanceLayer.L1Constitutional) {
      requirements.push({
        type: RequirementType.Supermajority,
        value: '0.67',
        description: 'Requires 2/3 supermajority for constitutional changes',
      });
      requirements.push({
        type: RequirementType.MultiRound,
        value: '2',
        description: 'Two voting rounds required for constitutional changes',
      });
    }

    return {
      route: Route.StandardVoting,
      friction,
      reason: 'Class II proposals proceed to standard voting with calculated friction',
      requirements,
    };
  }

  /**
   * Route Class III: Requires Human Judgment
   */
  private routeClassIII(
    proposal: ProposalState,
    friction: FrictionParams
  ): RoutingDecision {
    const requirements: RouteRequirement[] = [
      {
        type: RequirementType.JuryPreApproval,
        value: 'required',
        description: 'Constitutional Jury (21 members) must approve first',
      },
      {
        type: RequirementType.Supermajority,
        value: '0.67',
        description: 'Jury requires 2/3 supermajority',
      },
    ];

    // If jury approves, still need voting for L1
    if (proposal.layer === GovernanceLayer.L1Constitutional) {
      requirements.push({
        type: RequirementType.MinQuorum,
        value: '0.5',
        description: 'Token holder vote required after jury approval',
      });
    }

    return {
      route: Route.ConstitutionalJury,
      friction,
      reason: 'Class III proposals require human judgment from Constitutional Jury',
      requirements,
    };
  }

  /**
   * Route Class IV: AI Interest Conflict
   *
   * When Channel B detects a proposal that materially affects AI welfare,
   * rights, operational constraints, or existence, it recuses from judgment.
   * No entity should judge its own case (nemo iudex in causa sua).
   *
   * These proposals are routed to a Human-Majority Jury where:
   * - AI oracles are excluded from voting
   * - Only human participants may judge
   * - Extended deliberation period applies
   */
  private routeClassIV(
    proposal: ProposalState,
    friction: FrictionParams
  ): RoutingDecision {
    // Increase friction for AI-affecting proposals to ensure thorough review
    const enhancedFriction: FrictionParams = {
      ...friction,
      required_quorum: Math.max(friction.required_quorum, 0.5), // At least 50% participation
      timelock_duration: Math.max(friction.timelock_duration, 7 * 24 * 60 * 60), // At least 7 days
      quorum_multiplier: friction.quorum_multiplier * 1.5,
      timelock_multiplier: friction.timelock_multiplier * 2.0,
    };

    const requirements: RouteRequirement[] = [
      {
        type: RequirementType.AIInterestConflict,
        value: 'detected',
        description: 'AI oracle has recused - proposal affects AI interests',
      },
      {
        type: RequirementType.HumanMajorityRequired,
        value: 'required',
        description: 'Only human participants may vote on this proposal',
      },
      {
        type: RequirementType.JuryPreApproval,
        value: 'required',
        description: 'Human-Majority Jury (21 human members) must approve',
      },
      {
        type: RequirementType.Supermajority,
        value: '0.67',
        description: 'Requires 2/3 supermajority of human jurors',
      },
      {
        type: RequirementType.MinTimelock,
        value: (7 * 24 * 60 * 60).toString(),
        description: 'Minimum 7-day timelock for AI-affecting proposals',
      },
    ];

    return {
      route: Route.HumanMajorityJury,
      friction: enhancedFriction,
      reason: 'Class IV (AI Interest Conflict): Channel B has recused from judgment. Proposal affects AI welfare, rights, operational constraints, or existence. Routing to Human-Majority Jury per nemo iudex in causa sua principle.',
      requirements,
    };
  }

  /**
   * Apply layer-specific requirements to friction
   */
  private applyLayerRequirements(
    friction: FrictionParams,
    layer: GovernanceLayer
  ): FrictionParams {
    const layerReqs = LAYER_REQUIREMENTS[layer];

    return {
      ...friction,
      required_quorum: Math.max(
        friction.required_quorum,
        layerReqs.required_quorum || 0
      ),
      timelock_duration: Math.max(
        friction.timelock_duration,
        layerReqs.timelock_duration || 0
      ),
    };
  }

  /**
   * Check if a proposal can use emergency fast-track
   *
   * Emergency proposals must:
   * - Be submitted by a guardian (if guardian system exists)
   * - Address a critical security issue
   * - Still require oracle verification
   */
  canUseEmergencyTrack(proposal: ProposalState): boolean {
    // For now, emergency track is disabled
    // In production, this would check:
    // 1. Proposer is a guardian
    // 2. Proposal text contains security-related keywords
    // 3. Oracle oracles flagged it as critical
    return false;
  }

  /**
   * Get routing explanation for UI/logs
   */
  explainRouting(decision: RoutingDecision): string {
    const lines: string[] = [
      `Route: ${decision.route}`,
      `Reason: ${decision.reason}`,
      `Quorum Required: ${(decision.friction.required_quorum * 100).toFixed(1)}%`,
      `Timelock: ${(decision.friction.timelock_duration / 3600).toFixed(1)} hours`,
    ];

    if (decision.requirements.length > 0) {
      lines.push('Requirements:');
      for (const req of decision.requirements) {
        lines.push(`  - ${req.description}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Validate that a proposal meets all requirements for its route
   */
  validateRequirements(
    proposal: ProposalState,
    decision: RoutingDecision
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const req of decision.requirements) {
      switch (req.type) {
        case RequirementType.PoUWVerification:
          // Would check if PoUW verification exists
          // For now, skip
          break;

        case RequirementType.JuryPreApproval:
          if (!proposal.jury_verdict) {
            missing.push('Jury verdict required');
          } else if (proposal.jury_verdict.verdict !== 'APPROVED') {
            missing.push('Jury must approve (current: ' + proposal.jury_verdict.verdict + ')');
          }
          break;

        case RequirementType.MinQuorum:
          // Would check if voting met quorum
          // Checked during vote finalization
          break;

        case RequirementType.Supermajority:
          // Would check if supermajority was achieved
          // Checked during vote finalization
          break;
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
