/**
 * Wallet Commands
 *
 * CLI commands for wallet management:
 * - create: Create a new wallet
 * - import: Import existing wallet
 * - balance: Check wallet balance
 * - fund: Fund wallet from testnet faucet
 * - info: Show wallet information
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Wallet } from 'xrpl';
import { getClient, getConfig, formatXRP } from '../utils/client';
import { loadConfig, saveConfig, CLIConfig } from './config';

export function walletCommands(): Command {
  const wallet = new Command('wallet')
    .description('Wallet management');

  // Create a new wallet
  wallet
    .command('create')
    .description('Create a new XRPL wallet')
    .option('-s, --save', 'Save wallet to config')
    .action(async (options) => {
      try {
        const newWallet = Wallet.generate();

        console.log('');
        console.log(chalk.bold('New Wallet Created'));
        console.log('═'.repeat(50));
        console.log(`  Address: ${chalk.cyan(newWallet.address)}`);
        console.log(`  Public Key: ${newWallet.publicKey}`);
        console.log(`  Secret: ${chalk.yellow(newWallet.seed)}`);
        console.log('');
        console.log(chalk.red.bold('⚠️  IMPORTANT: Save your secret key securely!'));
        console.log(chalk.red('    This is the only time it will be displayed.'));

        if (options.save) {
          const config = loadConfig();
          config.walletAddress = newWallet.address;
          config.walletSecret = newWallet.seed;
          saveConfig(config);
          console.log('');
          console.log(chalk.green('✓ Wallet saved to config'));
        }

        // Fund on testnet
        const config = getConfig();
        if (config.network === 'testnet' || config.network === 'devnet') {
          console.log('');
          console.log(chalk.dim(`Use 'dao wallet fund' to get testnet XRP`));
        }
      } catch (error) {
        console.log(chalk.red(`Failed to create wallet: ${error}`));
      }
    });

  // Import existing wallet
  wallet
    .command('import <secret>')
    .description('Import wallet from secret key')
    .action(async (secret) => {
      try {
        const importedWallet = Wallet.fromSeed(secret);

        const config = loadConfig();
        config.walletAddress = importedWallet.address;
        config.walletSecret = secret;
        saveConfig(config);

        console.log('');
        console.log(chalk.green('✓ Wallet imported successfully'));
        console.log(`  Address: ${chalk.cyan(importedWallet.address)}`);
      } catch (error) {
        console.log(chalk.red(`Failed to import wallet: ${error}`));
      }
    });

  // Check wallet balance
  wallet
    .command('balance [address]')
    .description('Check wallet balance')
    .action(async (address) => {
      const spinner = ora('Fetching balance...').start();

      try {
        const client = await getClient();
        const config = getConfig();
        const targetAddress = address || config.walletAddress;

        if (!targetAddress) {
          spinner.fail('No wallet address configured. Use `dao wallet create` or `dao config set walletAddress <address>`');
          return;
        }

        const balance = await client.getBalance(targetAddress);

        spinner.stop();

        console.log('');
        console.log(chalk.bold('Wallet Balance'));
        console.log('═'.repeat(50));
        console.log(`  Address: ${chalk.cyan(targetAddress)}`);
        console.log(`  Balance: ${chalk.green(formatXRP(balance))}`);
        console.log(`  Network: ${chalk.yellow(config.network)}`);
      } catch (error: any) {
        if (error.message?.includes('Account not found')) {
          spinner.fail('Account not found on network. Use `dao wallet fund` to activate.');
        } else {
          spinner.fail(`Failed to fetch balance: ${error}`);
        }
      }
    });

  // Fund wallet from testnet faucet
  wallet
    .command('fund')
    .description('Fund wallet from testnet faucet')
    .action(async () => {
      const config = getConfig();

      if (config.network === 'mainnet') {
        console.log(chalk.red('Cannot use faucet on mainnet'));
        return;
      }

      const spinner = ora('Requesting testnet XRP...').start();

      try {
        const client = await getClient();

        if (!config.walletSecret) {
          spinner.fail('No wallet configured. Use `dao wallet create` first.');
          return;
        }

        // fundWallet uses the wallet set on the client
        const result = await client.fundWallet();

        spinner.succeed('Wallet funded!');

        console.log('');
        console.log(chalk.bold('Faucet Result'));
        console.log('═'.repeat(50));
        console.log(`  Address: ${chalk.cyan(result.wallet.address)}`);
        console.log(`  Balance: ${chalk.green(formatXRP(String(result.balance * 1_000_000)))}`);
      } catch (error) {
        spinner.fail(`Failed to fund wallet: ${error}`);
      }
    });

  // Show wallet info
  wallet
    .command('info')
    .description('Show current wallet information')
    .action(async () => {
      try {
        const config = getConfig();

        if (!config.walletAddress) {
          console.log(chalk.yellow('No wallet configured.'));
          console.log(chalk.dim('Use `dao wallet create` or `dao wallet import <secret>`'));
          return;
        }

        console.log('');
        console.log(chalk.bold('Wallet Information'));
        console.log('═'.repeat(50));
        console.log(`  Address: ${chalk.cyan(config.walletAddress)}`);
        console.log(`  Network: ${chalk.yellow(config.network)}`);
        console.log(`  Secret: ${config.walletSecret ? chalk.dim('***' + config.walletSecret.slice(-4)) : chalk.red('Not set')}`);

        // Try to fetch balance
        try {
          const client = await getClient();
          const balance = await client.getBalance(config.walletAddress);
          console.log(`  Balance: ${chalk.green(formatXRP(balance))}`);
        } catch {
          console.log(`  Balance: ${chalk.dim('Unable to fetch')}`);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to get wallet info: ${error}`));
      }
    });

  // Export wallet
  wallet
    .command('export')
    .description('Export wallet secret (use with caution)')
    .action(async () => {
      const config = getConfig();

      if (!config.walletSecret) {
        console.log(chalk.yellow('No wallet secret configured.'));
        return;
      }

      console.log('');
      console.log(chalk.red.bold('⚠️  WARNING: Keep this secret safe!'));
      console.log('');
      console.log(chalk.bold('Wallet Export'));
      console.log('═'.repeat(50));
      console.log(`  Address: ${chalk.cyan(config.walletAddress)}`);
      console.log(`  Secret: ${chalk.yellow(config.walletSecret)}`);
    });

  return wallet;
}
