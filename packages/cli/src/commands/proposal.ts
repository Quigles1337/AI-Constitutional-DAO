/**
 * Proposal Commands
 *
 * CLI commands for proposal management:
 * - submit: Create a new proposal
 * - status: Check proposal status
 * - list: List proposals with filters
 * - details: Show full proposal details
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getClient, getOrchestrator } from '../utils/client';
import { GovernanceLayer, ProposalStatus } from '@ai-constitution-dao/oracle-node';

export function proposalCommands(): Command {
  const proposal = new Command('proposal')
    .description('Manage governance proposals');

  // Submit a new proposal
  proposal
    .command('submit')
    .description('Submit a new governance proposal')
    .requiredOption('-t, --text <text>', 'Proposal description text')
    .requiredOption('-l, --logic <json>', 'Proposal logic as JSON')
    .option('--layer <layer>', 'Governance layer (L1, L2, L3)', 'L2')
    .action(async (options) => {
      const spinner = ora('Submitting proposal...').start();

      try {
        const orchestrator = await getOrchestrator();

        // Parse layer
        const layerMap: Record<string, GovernanceLayer> = {
          'L1': GovernanceLayer.L1Constitutional,
          'L2': GovernanceLayer.L2Operational,
          'L3': GovernanceLayer.L3Execution,
        };
        const layer = layerMap[options.layer] || GovernanceLayer.L2Operational;

        // Validate JSON
        let logicAst: string;
        try {
          const parsed = JSON.parse(options.logic);
          logicAst = JSON.stringify(parsed);
        } catch {
          spinner.fail('Invalid JSON in --logic parameter');
          return;
        }

        // Submit proposal
        const proposal = await orchestrator.submitProposal({
          text: options.text,
          logic_ast: logicAst,
          layer,
        });

        spinner.succeed('Proposal submitted successfully!');

        console.log('');
        console.log(chalk.bold('Proposal Details:'));
        console.log(`  ID: ${chalk.cyan(proposal.proposal.id)}`);
        console.log(`  Layer: ${chalk.yellow(layer)}`);
        console.log(`  Status: ${chalk.green(proposal.phase)}`);
        console.log(`  Text: ${options.text.slice(0, 60)}...`);
        console.log('');
        console.log(chalk.dim('Oracle review will begin automatically.'));
      } catch (error) {
        spinner.fail(`Failed to submit proposal: ${error}`);
      }
    });

  // Check proposal status
  proposal
    .command('status <proposalId>')
    .description('Check the status of a proposal')
    .action(async (proposalId) => {
      const spinner = ora('Fetching proposal status...').start();

      try {
        const orchestrator = await getOrchestrator();
        const proposal = orchestrator.getProposal(proposalId);

        if (!proposal) {
          spinner.fail('Proposal not found');
          return;
        }

        spinner.stop();

        console.log('');
        console.log(chalk.bold('Proposal Status'));
        console.log('═'.repeat(50));
        console.log(`  ID: ${chalk.cyan(proposal.proposal.id.slice(0, 32))}...`);
        console.log(`  Phase: ${getPhaseColor(proposal.phase)}`);
        console.log(`  Status: ${getStatusColor(proposal.proposal.status)}`);
        console.log(`  Layer: ${chalk.yellow(proposal.proposal.layer)}`);
        console.log(`  Proposer: ${proposal.proposal.proposer}`);
        console.log(`  Created: ${new Date(proposal.proposal.created_at).toISOString()}`);

        if (proposal.proposal.friction) {
          console.log('');
          console.log(chalk.bold('Friction Parameters:'));
          console.log(`  Quorum: ${(proposal.proposal.friction.required_quorum * 100).toFixed(1)}%`);
          console.log(`  Timelock: ${(proposal.proposal.friction.timelock_duration / 3600).toFixed(1)} hours`);
          console.log(`  Alignment: ${(proposal.proposal.friction.alignment_score * 100).toFixed(1)}%`);
        }

        if (proposal.votingTally) {
          console.log('');
          console.log(chalk.bold('Voting Results:'));
          console.log(`  Yes: ${proposal.votingTally.yes_power}`);
          console.log(`  No: ${proposal.votingTally.no_power}`);
          console.log(`  Abstain: ${proposal.votingTally.abstain_power}`);
          console.log(`  Participation: ${(proposal.votingTally.participation_rate * 100).toFixed(1)}%`);
          console.log(`  Passed: ${proposal.votingTally.passed ? chalk.green('✓') : chalk.red('✗')}`);
        }

        if (proposal.routing) {
          console.log('');
          console.log(chalk.bold('Routing:'));
          console.log(`  Route: ${chalk.magenta(proposal.routing.route)}`);
          console.log(`  Reason: ${proposal.routing.reason}`);
        }

        console.log('');
      } catch (error) {
        spinner.fail(`Failed to fetch status: ${error}`);
      }
    });

  // List proposals
  proposal
    .command('list')
    .description('List all proposals')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Limit results', '10')
    .action(async (options) => {
      const spinner = ora('Fetching proposals...').start();

      try {
        const orchestrator = await getOrchestrator();
        let proposals = orchestrator.getAllProposals();

        // Filter by status if specified
        if (options.status) {
          const statusFilter = options.status.toLowerCase();
          proposals = proposals.filter(p =>
            p.phase.toLowerCase().includes(statusFilter) ||
            p.proposal.status.toLowerCase().includes(statusFilter)
          );
        }

        // Limit results
        const limit = parseInt(options.limit) || 10;
        proposals = proposals.slice(0, limit);

        spinner.stop();

        if (proposals.length === 0) {
          console.log(chalk.yellow('No proposals found.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold('ID'),
            chalk.bold('Layer'),
            chalk.bold('Phase'),
            chalk.bold('Status'),
            chalk.bold('Created'),
          ],
          colWidths: [20, 15, 15, 15, 25],
        });

        for (const p of proposals) {
          table.push([
            p.proposal.id.slice(0, 16) + '...',
            p.proposal.layer.replace('Governance.', ''),
            p.phase,
            p.proposal.status,
            new Date(p.proposal.created_at).toLocaleDateString(),
          ]);
        }

        console.log('');
        console.log(chalk.bold(`Proposals (${proposals.length})`));
        console.log(table.toString());
      } catch (error) {
        spinner.fail(`Failed to list proposals: ${error}`);
      }
    });

  return proposal;
}

function getPhaseColor(phase: string): string {
  const colors: Record<string, (s: string) => string> = {
    'Submitted': chalk.blue,
    'OracleReview': chalk.yellow,
    'Voting': chalk.cyan,
    'Timelock': chalk.magenta,
    'Executed': chalk.green,
    'Rejected': chalk.red,
  };
  return (colors[phase] || chalk.white)(phase);
}

function getStatusColor(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    'Pending': chalk.blue,
    'Voting': chalk.cyan,
    'Passed': chalk.green,
    'Rejected': chalk.red,
    'Executed': chalk.green,
  };
  return (colors[status] || chalk.white)(status);
}
