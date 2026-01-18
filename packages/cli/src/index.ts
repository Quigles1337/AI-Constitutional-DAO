#!/usr/bin/env node
/**
 * AI Constitution DAO CLI
 *
 * Command-line interface for interacting with the governance system.
 *
 * Usage:
 *   dao proposal submit --text "..." --logic "{...}" --layer L2
 *   dao proposal status <proposal-id>
 *   dao proposal list [--status pending|voting|passed]
 *   dao vote <proposal-id> --vote yes|no|abstain
 *   dao oracle register --bond 100000
 *   dao oracle status
 *   dao config set <key> <value>
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { proposalCommands } from './commands/proposal';
import { voteCommands } from './commands/vote';
import { oracleCommands } from './commands/oracle';
import { configCommands } from './commands/config';
import { walletCommands } from './commands/wallet';
import { statusCommand } from './commands/status';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('dao')
  .description('AI Constitution DAO CLI - Governance on XRPL')
  .version('0.1.0');

// Add command groups
program.addCommand(proposalCommands());
program.addCommand(voteCommands());
program.addCommand(oracleCommands());
program.addCommand(configCommands());
program.addCommand(walletCommands());
program.addCommand(statusCommand());

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
