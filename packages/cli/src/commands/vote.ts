/**
 * Vote Commands
 *
 * CLI commands for voting:
 * - cast: Cast a vote on a proposal
 * - delegate: Delegate voting power
 * - undelegate: Remove delegation
 * - power: Check voting power
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getClient, getOrchestrator, getConfig } from '../utils/client';
import { Vote } from '@ai-constitution-dao/oracle-node';

export function voteCommands(): Command {
  const vote = new Command('vote')
    .description('Voting operations');

  // Cast a vote
  vote
    .command('cast <proposalId>')
    .description('Cast a vote on a proposal')
    .option('-v, --vote <vote>', 'Vote choice: yes, no, or abstain')
    .option('-p, --power <power>', 'Voting power to use')
    .action(async (proposalId, options) => {
      try {
        const orchestrator = await getOrchestrator();
        const config = getConfig();

        // Get proposal to verify it's in voting phase
        const proposal = orchestrator.getProposal(proposalId);
        if (!proposal) {
          console.log(chalk.red('Proposal not found'));
          return;
        }

        if (proposal.phase !== 'Voting') {
          console.log(chalk.red(`Proposal is not in voting phase (current: ${proposal.phase})`));
          return;
        }

        // Get vote choice
        let voteChoice: Vote;
        if (options.vote) {
          const voteMap: Record<string, Vote> = {
            'yes': Vote.Yes,
            'no': Vote.No,
            'abstain': Vote.Abstain,
          };
          voteChoice = voteMap[options.vote.toLowerCase()];
          if (!voteChoice) {
            console.log(chalk.red('Invalid vote. Use: yes, no, or abstain'));
            return;
          }
        } else {
          // Prompt for vote
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'vote',
              message: 'How do you vote?',
              choices: [
                { name: 'Yes - Support the proposal', value: Vote.Yes },
                { name: 'No - Oppose the proposal', value: Vote.No },
                { name: 'Abstain - No position', value: Vote.Abstain },
              ],
            },
          ]);
          voteChoice = answer.vote;
        }

        // Get voting power
        const votingPower = options.power || config.defaultVotingPower || '100000000000';

        const spinner = ora('Casting vote...').start();

        await orchestrator.castVote(
          proposalId,
          config.walletAddress || 'cli_voter',
          voteChoice,
          votingPower
        );

        spinner.succeed('Vote cast successfully!');

        console.log('');
        console.log(chalk.bold('Vote Details:'));
        console.log(`  Proposal: ${chalk.cyan(proposalId.slice(0, 32))}...`);
        console.log(`  Vote: ${getVoteColor(voteChoice)}`);
        console.log(`  Power: ${votingPower}`);

        // Show current tally
        const votingSystem = orchestrator.getVotingSystem();
        const tally = votingSystem.getCurrentTally(proposalId);
        console.log('');
        console.log(chalk.bold('Current Tally:'));
        console.log(`  Yes: ${tally.yes}`);
        console.log(`  No: ${tally.no}`);
        console.log(`  Abstain: ${tally.abstain}`);
        console.log(`  Voters: ${tally.voters}`);
      } catch (error) {
        console.log(chalk.red(`Failed to cast vote: ${error}`));
      }
    });

  // Delegate voting power
  vote
    .command('delegate <address>')
    .description('Delegate voting power to another address')
    .requiredOption('-a, --amount <amount>', 'Amount of power to delegate')
    .action(async (address, options) => {
      const spinner = ora('Delegating voting power...').start();

      try {
        const orchestrator = await getOrchestrator();
        const config = getConfig();
        const votingSystem = orchestrator.getVotingSystem();

        votingSystem.delegate(
          config.walletAddress || 'cli_delegator',
          address,
          options.amount
        );

        spinner.succeed('Delegation successful!');

        console.log('');
        console.log(chalk.bold('Delegation Details:'));
        console.log(`  Delegate: ${chalk.cyan(address)}`);
        console.log(`  Amount: ${options.amount}`);
      } catch (error) {
        spinner.fail(`Failed to delegate: ${error}`);
      }
    });

  // Remove delegation
  vote
    .command('undelegate <address>')
    .description('Remove delegation from an address')
    .action(async (address) => {
      const spinner = ora('Removing delegation...').start();

      try {
        const orchestrator = await getOrchestrator();
        const config = getConfig();
        const votingSystem = orchestrator.getVotingSystem();

        votingSystem.undelegate(
          config.walletAddress || 'cli_delegator',
          address
        );

        spinner.succeed('Delegation removed!');
      } catch (error) {
        spinner.fail(`Failed to undelegate: ${error}`);
      }
    });

  // Check voting power
  vote
    .command('power [address]')
    .description('Check voting power for an address')
    .action(async (address) => {
      try {
        const orchestrator = await getOrchestrator();
        const config = getConfig();
        const targetAddress = address || config.walletAddress || 'unknown';
        const votingSystem = orchestrator.getVotingSystem();

        const delegatedPower = votingSystem.getDelegatedPower(targetAddress);
        const delegations = votingSystem.getDelegations(targetAddress);

        console.log('');
        console.log(chalk.bold(`Voting Power for ${targetAddress}`));
        console.log('═'.repeat(50));
        console.log(`  Delegated to you: ${chalk.green(delegatedPower)}`);

        if (delegations.length > 0) {
          console.log('');
          console.log(chalk.bold('Your Delegations:'));
          for (const d of delegations) {
            console.log(`  → ${d.delegate}: ${d.amount}`);
          }
        }
      } catch (error) {
        console.log(chalk.red(`Failed to check power: ${error}`));
      }
    });

  return vote;
}

function getVoteColor(vote: Vote): string {
  switch (vote) {
    case Vote.Yes:
      return chalk.green('YES');
    case Vote.No:
      return chalk.red('NO');
    case Vote.Abstain:
      return chalk.yellow('ABSTAIN');
    default:
      return vote;
  }
}
