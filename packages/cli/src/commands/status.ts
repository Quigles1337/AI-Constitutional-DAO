/**
 * Status Command
 *
 * Display overall system status including:
 * - Network connectivity
 * - Wallet status
 * - Oracle network health
 * - Recent proposals
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getClient, getOrchestrator, getRegistry, getConfig, formatXRP, disconnect } from '../utils/client';
import { OracleStatus } from '@ai-constitution-dao/oracle-node';

export function statusCommand(): Command {
  const status = new Command('status')
    .description('Show system status')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options) => {
      const spinner = ora('Fetching system status...').start();

      try {
        const config = getConfig();
        let networkConnected = false;
        let walletBalance = '0';
        let oracleCount = 0;
        let activeOracles = 0;
        let proposalCount = 0;
        let activeProposals = 0;

        // Check network connectivity
        try {
          const client = await getClient();
          networkConnected = true;

          // Get wallet balance if configured
          if (config.walletAddress) {
            try {
              walletBalance = await client.getBalance(config.walletAddress);
            } catch {
              walletBalance = 'N/A';
            }
          }
        } catch {
          networkConnected = false;
        }

        // Get oracle stats
        try {
          const registry = await getRegistry();
          const operators = registry.getAllOperators();
          oracleCount = operators.length;
          activeOracles = operators.filter(o => o.status === OracleStatus.Active).length;
        } catch {
          // Ignore
        }

        // Get proposal stats
        try {
          const orchestrator = await getOrchestrator();
          const proposals = orchestrator.getAllProposals();
          proposalCount = proposals.length;
          activeProposals = proposals.filter(p =>
            p.phase !== 'Executed' && p.phase !== 'Rejected'
          ).length;
        } catch {
          // Ignore
        }

        spinner.stop();

        // Display header
        console.log('');
        console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('║') + '       AI Constitution DAO - System Status         ' + chalk.bold.cyan('║'));
        console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════╝'));
        console.log('');

        // Network status
        console.log(chalk.bold('📡 Network'));
        console.log('─'.repeat(50));
        console.log(`  Network: ${chalk.yellow(config.network)}`);
        console.log(`  Status: ${networkConnected ? chalk.green('● Connected') : chalk.red('● Disconnected')}`);
        console.log('');

        // Wallet status
        console.log(chalk.bold('💳 Wallet'));
        console.log('─'.repeat(50));
        if (config.walletAddress) {
          console.log(`  Address: ${chalk.cyan(config.walletAddress)}`);
          console.log(`  Balance: ${walletBalance !== 'N/A' ? chalk.green(formatXRP(walletBalance)) : chalk.dim('N/A')}`);
        } else {
          console.log(chalk.dim('  No wallet configured'));
          console.log(chalk.dim('  Use `dao wallet create` to set up'));
        }
        console.log('');

        // Oracle network status
        console.log(chalk.bold('🔮 Oracle Network'));
        console.log('─'.repeat(50));
        console.log(`  Total Oracles: ${oracleCount}`);
        console.log(`  Active Set: ${chalk.green(activeOracles.toString())} / 101`);
        const healthPercent = Math.min(100, Math.round((activeOracles / 101) * 100));
        const healthBar = getHealthBar(healthPercent);
        console.log(`  Health: ${healthBar} ${healthPercent}%`);
        console.log('');

        // Governance status
        console.log(chalk.bold('🏛️  Governance'));
        console.log('─'.repeat(50));
        console.log(`  Total Proposals: ${proposalCount}`);
        console.log(`  Active: ${chalk.yellow(activeProposals.toString())}`);
        console.log(`  DAO Treasury: ${chalk.cyan(config.daoAddress || 'Not set')}`);
        console.log('');

        // Verbose: Recent proposals
        if (options.verbose && proposalCount > 0) {
          console.log(chalk.bold('📋 Recent Proposals'));
          console.log('─'.repeat(50));

          const orchestrator = await getOrchestrator();
          const proposals = orchestrator.getAllProposals().slice(0, 5);

          const table = new Table({
            head: [
              chalk.dim('ID'),
              chalk.dim('Layer'),
              chalk.dim('Phase'),
              chalk.dim('Created'),
            ],
            colWidths: [18, 12, 15, 15],
          });

          for (const p of proposals) {
            table.push([
              p.proposal.id.slice(0, 14) + '...',
              p.proposal.layer.replace('Governance.', ''),
              getPhaseIndicator(p.phase),
              new Date(p.proposal.created_at).toLocaleDateString(),
            ]);
          }

          console.log(table.toString());
          console.log('');
        }

        // Verbose: Active oracles
        if (options.verbose && activeOracles > 0) {
          console.log(chalk.bold('👥 Active Oracles'));
          console.log('─'.repeat(50));

          const registry = await getRegistry();
          const operators = registry.getAllOperators()
            .filter(o => o.status === OracleStatus.Active)
            .slice(0, 5);

          const table = new Table({
            head: [
              chalk.dim('Address'),
              chalk.dim('Bond'),
              chalk.dim('Reveals'),
            ],
            colWidths: [22, 15, 12],
          });

          for (const op of operators) {
            table.push([
              op.address.slice(0, 18) + '...',
              formatXRP(op.bond_amount),
              op.metrics.successful_reveals.toString(),
            ]);
          }

          console.log(table.toString());
          console.log('');
        }

        // Footer
        console.log(chalk.dim('─'.repeat(50)));
        console.log(chalk.dim(`Config: ~/.dao-cli/config.json`));
        console.log(chalk.dim(`Use 'dao --help' for available commands`));
        console.log('');

        await disconnect();
      } catch (error) {
        spinner.fail(`Failed to get status: ${error}`);
      }
    });

  return status;
}

function getHealthBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = chalk.green;
  if (percent < 50) color = chalk.red;
  else if (percent < 80) color = chalk.yellow;

  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function getPhaseIndicator(phase: string): string {
  const indicators: Record<string, string> = {
    'Submitted': chalk.blue('● Submitted'),
    'OracleReview': chalk.yellow('● Oracle Review'),
    'Voting': chalk.cyan('● Voting'),
    'Timelock': chalk.magenta('● Timelock'),
    'Executed': chalk.green('✓ Executed'),
    'Rejected': chalk.red('✗ Rejected'),
  };
  return indicators[phase] || phase;
}
