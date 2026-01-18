/**
 * Client Utilities
 *
 * Shared utilities for CLI commands to interact with the oracle network.
 */

import { Client, Wallet } from 'xrpl';
import {
  GovernanceOrchestrator,
  OracleRegistry,
  StakingManager,
  XRPLClient,
} from '@ai-constitution-dao/oracle-node';
import { loadConfig, CLIConfig } from '../commands/config';

// Singleton instances
let xrplClient: XRPLClient | null = null;
let orchestrator: GovernanceOrchestrator | null = null;
let registry: OracleRegistry | null = null;
let stakingManager: StakingManager | null = null;

/**
 * Get the current CLI configuration
 */
export function getConfig(): CLIConfig {
  return loadConfig();
}

/**
 * Get or create XRPL client connection
 */
export async function getClient(): Promise<XRPLClient> {
  if (xrplClient) {
    return xrplClient;
  }

  const config = loadConfig();

  // XRPLClient takes NetworkType directly
  xrplClient = new XRPLClient(config.network as 'testnet' | 'devnet' | 'mainnet');

  // If wallet credentials are configured, set the wallet
  if (config.walletSecret) {
    const wallet = Wallet.fromSeed(config.walletSecret);
    xrplClient.setWallet(wallet);
  }

  await xrplClient.connect();
  return xrplClient;
}

/**
 * Get or create the governance orchestrator
 */
export async function getOrchestrator(): Promise<GovernanceOrchestrator> {
  if (orchestrator) {
    return orchestrator;
  }

  const client = await getClient();
  const config = loadConfig();

  orchestrator = new GovernanceOrchestrator(client, {
    daoTreasuryAddress: config.daoAddress || 'rDAOTreasury123',
    anthropicApiKey: config.anthropicApiKey,
  });

  return orchestrator;
}

/**
 * Get or create the oracle registry
 */
export async function getRegistry(): Promise<OracleRegistry> {
  if (registry) {
    return registry;
  }

  const client = await getClient();
  registry = new OracleRegistry(client);
  return registry;
}

/**
 * Get or create the staking manager
 */
export async function getStakingManager(): Promise<StakingManager> {
  if (stakingManager) {
    return stakingManager;
  }

  const client = await getClient();
  const config = loadConfig();

  stakingManager = new StakingManager(client, {
    daoTreasuryAddress: config.daoAddress || 'rDAOTreasury123',
    walletAddress: config.walletAddress,
  });

  return stakingManager;
}

/**
 * Disconnect all clients
 */
export async function disconnect(): Promise<void> {
  if (xrplClient) {
    await xrplClient.disconnect();
    xrplClient = null;
  }
  orchestrator = null;
  registry = null;
  stakingManager = null;
}

/**
 * Format XRP amount from drops
 */
export function formatXRP(drops: string | number): string {
  const xrp = Number(drops) / 1_000_000;
  if (xrp >= 1_000_000) {
    return `${(xrp / 1_000_000).toFixed(2)}M XRP`;
  } else if (xrp >= 1_000) {
    return `${(xrp / 1_000).toFixed(2)}k XRP`;
  }
  return `${xrp.toFixed(6)} XRP`;
}

/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number = 20): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
