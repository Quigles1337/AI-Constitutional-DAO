/**
 * AI Constitution DAO SDK - Proposal Helpers
 *
 * Utilities for creating and managing proposals.
 */

import {
  ProposalInput,
  GovernanceLayer,
  Proposal,
  ProposalStatus,
  calculateFriction,
  FrictionParams,
} from '@ai-constitution-dao/oracle-node';
import * as crypto from 'crypto';

/**
 * Proposal builder for creating well-formed proposals
 */
export class ProposalBuilder {
  private text: string = '';
  private logic: Record<string, any> = {};
  private layer: GovernanceLayer = GovernanceLayer.L2Operational;

  /**
   * Set the proposal description text
   */
  setText(text: string): this {
    this.text = text;
    return this;
  }

  /**
   * Set the target governance layer
   */
  setLayer(layer: GovernanceLayer): this {
    this.layer = layer;
    return this;
  }

  /**
   * Set the proposal logic AST
   */
  setLogic(logic: Record<string, any>): this {
    this.logic = logic;
    return this;
  }

  /**
   * Add a parameter change to the logic
   */
  addParameterChange(parameter: string, value: any): this {
    if (!this.logic.changes) {
      this.logic.changes = [];
    }
    this.logic.changes.push({ type: 'parameter_change', parameter, value });
    return this;
  }

  /**
   * Add a treasury transfer to the logic
   */
  addTreasuryTransfer(recipient: string, amount: string, reason: string): this {
    if (!this.logic.transfers) {
      this.logic.transfers = [];
    }
    this.logic.transfers.push({
      type: 'treasury_transfer',
      recipient,
      amount,
      reason,
    });
    return this;
  }

  /**
   * Add a contract upgrade to the logic
   */
  addContractUpgrade(contract: string, newCode: string): this {
    if (!this.logic.upgrades) {
      this.logic.upgrades = [];
    }
    this.logic.upgrades.push({
      type: 'contract_upgrade',
      contract,
      new_code_hash: crypto.createHash('sha256').update(newCode).digest('hex'),
    });
    return this;
  }

  /**
   * Build the proposal input
   */
  build(): ProposalInput {
    if (!this.text) {
      throw new Error('Proposal text is required');
    }
    if (Object.keys(this.logic).length === 0) {
      throw new Error('Proposal logic is required');
    }

    return {
      text: this.text,
      logic_ast: JSON.stringify(this.logic),
      layer: this.layer,
    };
  }
}

/**
 * Pre-built proposal templates
 */
export const ProposalTemplates = {
  /**
   * Create a parameter change proposal
   */
  parameterChange(params: {
    parameter: string;
    oldValue: any;
    newValue: any;
    reason: string;
  }): ProposalInput {
    return new ProposalBuilder()
      .setText(
        `Change ${params.parameter} from ${params.oldValue} to ${params.newValue}. ` +
          `Reason: ${params.reason}`
      )
      .setLayer(GovernanceLayer.L2Operational)
      .addParameterChange(params.parameter, params.newValue)
      .build();
  },

  /**
   * Create a treasury allocation proposal
   */
  treasuryAllocation(params: {
    recipient: string;
    amount: string;
    purpose: string;
  }): ProposalInput {
    return new ProposalBuilder()
      .setText(
        `Allocate ${params.amount} XRP from treasury to ${params.recipient}. ` +
          `Purpose: ${params.purpose}`
      )
      .setLayer(GovernanceLayer.L2Operational)
      .addTreasuryTransfer(params.recipient, params.amount, params.purpose)
      .build();
  },

  /**
   * Create a constitutional amendment proposal
   */
  constitutionalAmendment(params: {
    article: string;
    change: string;
    rationale: string;
  }): ProposalInput {
    return new ProposalBuilder()
      .setText(
        `Amendment to ${params.article}: ${params.change}. ` +
          `Rationale: ${params.rationale}`
      )
      .setLayer(GovernanceLayer.L1Constitutional)
      .setLogic({
        type: 'constitutional_amendment',
        article: params.article,
        change: params.change,
      })
      .build();
  },

  /**
   * Create an oracle parameter update proposal
   */
  oracleParameterUpdate(params: {
    parameter: 'bond_amount' | 'epoch_duration' | 'slash_rate' | 'reward_rate';
    newValue: string | number;
    justification: string;
  }): ProposalInput {
    return new ProposalBuilder()
      .setText(
        `Update oracle ${params.parameter} to ${params.newValue}. ` +
          `Justification: ${params.justification}`
      )
      .setLayer(GovernanceLayer.L2Operational)
      .addParameterChange(`oracle.${params.parameter}`, params.newValue)
      .build();
  },
};

/**
 * Utility functions for proposal analysis
 */
export const ProposalUtils = {
  /**
   * Calculate the canonical hash of a proposal (proposal ID)
   */
  calculateProposalId(input: ProposalInput): string {
    // Sort logic AST keys for canonical form
    const sortedLogic = JSON.stringify(JSON.parse(input.logic_ast), Object.keys(JSON.parse(input.logic_ast)).sort());

    // Normalize text
    const normalizedText = input.text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Combine and hash
    const payload = sortedLogic + '.' + normalizedText;
    return crypto.createHash('sha256').update(payload).digest('hex');
  },

  /**
   * Estimate friction parameters for a given alignment score
   */
  estimateFriction(alignmentScore: number): FrictionParams {
    return calculateFriction(alignmentScore);
  },

  /**
   * Format proposal status for display
   */
  formatStatus(status: ProposalStatus): string {
    const statusMap: Record<ProposalStatus, string> = {
      [ProposalStatus.Pending]: 'Pending',
      [ProposalStatus.ChannelAReview]: 'Channel A Review',
      [ProposalStatus.ChannelBReview]: 'Channel B Review',
      [ProposalStatus.Voting]: 'Voting',
      [ProposalStatus.RequiresHumanReview]: 'Jury Review',
      [ProposalStatus.Passed]: 'Passed',
      [ProposalStatus.Rejected]: 'Rejected',
      [ProposalStatus.Executed]: 'Executed',
    };
    return statusMap[status] || status;
  },

  /**
   * Get layer requirements description
   */
  getLayerRequirements(layer: GovernanceLayer): {
    description: string;
    quorumMultiplier: number;
    timelockMultiplier: number;
  } {
    const requirements: Record<GovernanceLayer, ReturnType<typeof ProposalUtils.getLayerRequirements>> = {
      [GovernanceLayer.L0Immutable]: {
        description: 'Immutable Core - Cannot be modified through governance',
        quorumMultiplier: Infinity,
        timelockMultiplier: Infinity,
      },
      [GovernanceLayer.L1Constitutional]: {
        description: 'Constitutional Layer - Requires supermajority and extended timelock',
        quorumMultiplier: 2.0,
        timelockMultiplier: 3.0,
      },
      [GovernanceLayer.L2Operational]: {
        description: 'Operational Layer - Standard governance process',
        quorumMultiplier: 1.0,
        timelockMultiplier: 1.0,
      },
      [GovernanceLayer.L3Execution]: {
        description: 'Execution Layer - Fast-track for routine operations',
        quorumMultiplier: 0.5,
        timelockMultiplier: 0.5,
      },
    };
    return requirements[layer];
  },
};
