/**
 * Config Commands
 *
 * CLI commands for configuration:
 * - set: Set a configuration value
 * - get: Get a configuration value
 * - list: List all configuration
 * - reset: Reset to defaults
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.dao-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface CLIConfig {
  network: 'testnet' | 'mainnet' | 'devnet';
  walletAddress?: string;
  walletSecret?: string;
  daoAddress?: string;
  defaultVotingPower?: string;
  anthropicApiKey?: string;
}

const DEFAULT_CONFIG: CLIConfig = {
  network: 'testnet',
  daoAddress: 'rDAOTreasury123',
  defaultVotingPower: '100000000000',
};

export function configCommands(): Command {
  const config = new Command('config')
    .description('Manage CLI configuration');

  // Set a config value
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key, value) => {
      try {
        const cfg = loadConfig();

        // Validate key
        const validKeys = [
          'network',
          'walletAddress',
          'walletSecret',
          'daoAddress',
          'defaultVotingPower',
          'anthropicApiKey',
        ];

        if (!validKeys.includes(key)) {
          console.log(chalk.red(`Invalid key: ${key}`));
          console.log(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
          return;
        }

        // Set value
        (cfg as any)[key] = value;
        saveConfig(cfg);

        // Mask secrets
        const displayValue = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
          ? '***' + value.slice(-4)
          : value;

        console.log(chalk.green(`✓ Set ${key} = ${displayValue}`));
      } catch (error) {
        console.log(chalk.red(`Failed to set config: ${error}`));
      }
    });

  // Get a config value
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key) => {
      try {
        const cfg = loadConfig();
        const value = (cfg as any)[key];

        if (value === undefined) {
          console.log(chalk.yellow(`${key} is not set`));
        } else {
          // Mask secrets
          const displayValue = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
            ? '***' + value.slice(-4)
            : value;
          console.log(`${key} = ${chalk.cyan(displayValue)}`);
        }
      } catch (error) {
        console.log(chalk.red(`Failed to get config: ${error}`));
      }
    });

  // List all config
  config
    .command('list')
    .description('List all configuration values')
    .action(() => {
      try {
        const cfg = loadConfig();

        console.log('');
        console.log(chalk.bold('CLI Configuration'));
        console.log('═'.repeat(50));

        for (const [key, value] of Object.entries(cfg)) {
          if (value !== undefined) {
            // Mask secrets
            const displayValue = key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')
              ? '***' + String(value).slice(-4)
              : value;
            console.log(`  ${key}: ${chalk.cyan(displayValue)}`);
          }
        }

        console.log('');
        console.log(chalk.dim(`Config file: ${CONFIG_FILE}`));
      } catch (error) {
        console.log(chalk.red(`Failed to list config: ${error}`));
      }
    });

  // Reset config
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      try {
        saveConfig(DEFAULT_CONFIG);
        console.log(chalk.green('✓ Configuration reset to defaults'));
      } catch (error) {
        console.log(chalk.red(`Failed to reset config: ${error}`));
      }
    });

  // Init config
  config
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      const inquirer = await import('inquirer');

      const answers = await inquirer.default.prompt([
        {
          type: 'list',
          name: 'network',
          message: 'Select network:',
          choices: ['testnet', 'devnet', 'mainnet'],
          default: 'testnet',
        },
        {
          type: 'input',
          name: 'walletAddress',
          message: 'Wallet address (optional):',
        },
        {
          type: 'password',
          name: 'walletSecret',
          message: 'Wallet secret (optional):',
          mask: '*',
        },
        {
          type: 'input',
          name: 'daoAddress',
          message: 'DAO treasury address:',
          default: 'rDAOTreasury123',
        },
      ]);

      const cfg: CLIConfig = {
        network: answers.network,
        daoAddress: answers.daoAddress,
        defaultVotingPower: '100000000000',
      };

      if (answers.walletAddress) {
        cfg.walletAddress = answers.walletAddress;
      }
      if (answers.walletSecret) {
        cfg.walletSecret = answers.walletSecret;
      }

      saveConfig(cfg);
      console.log(chalk.green('✓ Configuration saved!'));
    });

  return config;
}

function loadConfig(): CLIConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: CLIConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Export for use in other commands
export { loadConfig, saveConfig, CLIConfig };
