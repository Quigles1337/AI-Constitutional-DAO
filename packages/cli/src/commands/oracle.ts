/**
 * Oracle Commands
 *
 * CLI commands for oracle operations:
 * - register: Register as an oracle
 * - status: Check oracle status
 * - stake: Increase stake
 * - unstake: Initiate unstaking
 * - rewards: Check and claim rewards
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getClient, getStakingManager, getRegistry, getConfig } from '../utils/client';
import { OracleStatus, CONFIG } from '@ai-constitution-dao/oracle-node';

export function oracleCommands(): Command {
  const oracle = new Command('oracle')
    .description('Oracle node operations');

  // Register as oracle
  oracle
    .command('register')
    .description('Register as an oracle operator')
    .option('-b, --bond <amount>', 'Bond amount in drops', CONFIG.ORACLE_BOND)
    .action(async (options) => {
      const spinner = ora('Registering as oracle...').start();

      try {
        const stakingManager = await getStakingManager();
        const result = await stakingManager.stake(options.bond);

        if (result.success) {
          spinner.succeed('Successfully registered as oracle!');

          console.log('');
          console.log(chalk.bold('Oracle Registration:'));
          console.log(`  Status: ${chalk.green(result.position?.status)}`);
          console.log(`  Staked: ${result.position?.staked_amount} drops`);
          console.log(`  Rank: #${result.position?.rank}`);
          console.log(`  Active Set: ${result.position?.is_active ? chalk.green('Yes') : chalk.yellow('No (candidate)')}`);
        } else {
          spinner.fail(result.message);
        }
      } catch (error) {
        spinner.fail(`Registration failed: ${error}`);
      }
    });

  // Check oracle status
  oracle
    .command('status [address]')
    .description('Check oracle status')
    .action(async (address) => {
      const spinner = ora('Fetching oracle status...').start();

      try {
        const stakingManager = await getStakingManager();
        const config = getConfig();
        const targetAddress = address || config.walletAddress;

        const position = await stakingManager.getPosition(targetAddress);

        spinner.stop();

        if (!position) {
          console.log(chalk.yellow('Not registered as oracle.'));
          console.log(chalk.dim('Use `dao oracle register` to become an oracle.'));
          return;
        }

        console.log('');
        console.log(chalk.bold('Oracle Status'));
        console.log('═'.repeat(50));
        console.log(`  Address: ${chalk.cyan(position.address)}`);
        console.log(`  Status: ${getStatusColor(position.status)}`);
        console.log(`  Active Set: ${position.is_active ? chalk.green('Yes') : chalk.yellow('No')}`);
        console.log(`  Rank: #${position.rank}`);
        console.log('');
        console.log(chalk.bold('Stake:'));
        console.log(`  Staked: ${formatDrops(position.staked_amount)}`);
        console.log(`  Effective: ${formatDrops(position.effective_stake)}`);
        console.log(`  Pending Slashes: ${chalk.red(formatDrops(position.pending_slashes))}`);
        console.log('');
        console.log(chalk.bold('Rewards:'));
        console.log(`  Pending: ${chalk.green(formatDrops(position.pending_rewards))}`);
        console.log(`  Total Earned: ${formatDrops(position.total_rewards)}`);

        if (position.unbonding) {
          console.log('');
          console.log(chalk.bold('Unbonding:'));
          console.log(`  Initiated: ${new Date(position.unbonding.initiated_at).toISOString()}`);
          console.log(`  Available: ${new Date(position.unbonding.available_at).toISOString()}`);
          console.log(`  Amount: ${formatDrops(position.unbonding.amount)}`);
        }
      } catch (error) {
        spinner.fail(`Failed to fetch status: ${error}`);
      }
    });

  // Increase stake
  oracle
    .command('stake <amount>')
    .description('Increase oracle stake')
    .action(async (amount) => {
      const spinner = ora('Increasing stake...').start();

      try {
        const stakingManager = await getStakingManager();
        const result = await stakingManager.increaseStake(amount);

        if (result.success) {
          spinner.succeed('Stake increased!');
          console.log(`  New stake: ${formatDrops(result.position?.staked_amount || '0')}`);
          console.log(`  New rank: #${result.position?.rank}`);
        } else {
          spinner.fail(result.message);
        }
      } catch (error) {
        spinner.fail(`Failed to increase stake: ${error}`);
      }
    });

  // Initiate unstaking
  oracle
    .command('unstake')
    .description('Initiate unstaking process')
    .action(async () => {
      const spinner = ora('Initiating unstake...').start();

      try {
        const stakingManager = await getStakingManager();
        const result = await stakingManager.initiateUnstake();

        if (result.success) {
          spinner.succeed('Unstaking initiated!');
          console.log(chalk.dim('You must wait one epoch (~2 weeks) before completing unstake.'));

          if (result.position?.unbonding) {
            console.log(`  Available at: ${new Date(result.position.unbonding.available_at).toISOString()}`);
          }
        } else {
          spinner.fail(result.message);
        }
      } catch (error) {
        spinner.fail(`Failed to initiate unstake: ${error}`);
      }
    });

  // Complete unstaking
  oracle
    .command('complete-unstake')
    .description('Complete unstaking after epoch delay')
    .action(async () => {
      const spinner = ora('Completing unstake...').start();

      try {
        const stakingManager = await getStakingManager();
        const result = await stakingManager.completeUnstake();

        if (result.success) {
          spinner.succeed('Unstaking complete!');
          console.log(result.message);
        } else {
          spinner.fail(result.message);
        }
      } catch (error) {
        spinner.fail(`Failed to complete unstake: ${error}`);
      }
    });

  // Check and claim rewards
  oracle
    .command('rewards')
    .description('Check and claim oracle rewards')
    .option('-c, --claim', 'Claim pending rewards')
    .action(async (options) => {
      try {
        const stakingManager = await getStakingManager();
        const config = getConfig();

        const position = await stakingManager.getPosition(config.walletAddress);

        if (!position) {
          console.log(chalk.yellow('Not registered as oracle.'));
          return;
        }

        console.log('');
        console.log(chalk.bold('Oracle Rewards'));
        console.log('═'.repeat(50));
        console.log(`  Pending: ${chalk.green(formatDrops(position.pending_rewards))}`);
        console.log(`  Total Earned: ${formatDrops(position.total_rewards)}`);

        if (options.claim && BigInt(position.pending_rewards) > 0) {
          const spinner = ora('Claiming rewards...').start();

          const result = await stakingManager.claimRewards();
          if (result.success) {
            spinner.succeed('Rewards claimed!');
            console.log(result.message);
          } else {
            spinner.fail(result.message);
          }
        } else if (BigInt(position.pending_rewards) > 0) {
          console.log('');
          console.log(chalk.dim('Use --claim to claim pending rewards.'));
        }
      } catch (error) {
        console.log(chalk.red(`Failed to check rewards: ${error}`));
      }
    });

  // List all oracles
  oracle
    .command('list')
    .description('List all registered oracles')
    .option('-a, --active', 'Show only active oracles')
    .action(async (options) => {
      const spinner = ora('Fetching oracles...').start();

      try {
        const registry = await getRegistry();
        let operators = registry.getAllOperators();

        if (options.active) {
          operators = operators.filter(o => o.status === OracleStatus.Active);
        }

        spinner.stop();

        if (operators.length === 0) {
          console.log(chalk.yellow('No oracles registered.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold('Address'),
            chalk.bold('Status'),
            chalk.bold('Stake'),
            chalk.bold('Reveals'),
            chalk.bold('Missed'),
          ],
          colWidths: [25, 12, 15, 10, 10],
        });

        for (const op of operators) {
          table.push([
            op.address.slice(0, 20) + '...',
            getStatusColor(op.status),
            formatDrops(op.bond_amount),
            op.metrics.successful_reveals.toString(),
            op.metrics.missed_reveals.toString(),
          ]);
        }

        console.log('');
        console.log(chalk.bold(`Oracles (${operators.length})`));
        console.log(table.toString());
      } catch (error) {
        spinner.fail(`Failed to list oracles: ${error}`);
      }
    });

  return oracle;
}

function getStatusColor(status: OracleStatus | string): string {
  const colors: Record<string, (s: string) => string> = {
    'Active': chalk.green,
    'Candidate': chalk.yellow,
    'Unbonding': chalk.magenta,
    'Ejected': chalk.red,
    'Unregistered': chalk.gray,
  };
  return (colors[status] || chalk.white)(status);
}

function formatDrops(drops: string): string {
  const xrp = parseInt(drops) / 1000000;
  if (xrp >= 1000000) {
    return `${(xrp / 1000000).toFixed(2)}M XRP`;
  } else if (xrp >= 1000) {
    return `${(xrp / 1000).toFixed(2)}k XRP`;
  }
  return `${xrp.toFixed(2)} XRP`;
}
