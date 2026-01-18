/**
 * XRPL Client for AI Constitution DAO
 *
 * Handles connection to XRPL networks (testnet, devnet, mainnet)
 * and provides transaction submission capabilities.
 */

import {
  Client,
  Wallet,
  xrpToDrops,
  dropsToXrp,
  AccountInfoRequest,
  AccountInfoResponse,
  TxResponse,
  Payment,
  Transaction,
  SubmittableTransaction,
} from 'xrpl';

/**
 * Network configuration
 */
export type NetworkType = 'testnet' | 'devnet' | 'mainnet';

const NETWORK_URLS: Record<NetworkType, string> = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
};

const FAUCET_URLS: Record<NetworkType, string | null> = {
  testnet: 'https://faucet.altnet.rippletest.net/accounts',
  devnet: 'https://faucet.devnet.rippletest.net/accounts',
  mainnet: null, // No faucet for mainnet
};

/**
 * Transaction result from submitAndWait
 */
export interface TransactionResult {
  hash: string;
  result: string;
  ledger_index: number;
  validated: boolean;
}

/**
 * XRPL Client wrapper for the AI Constitution DAO
 */
export class XRPLClient {
  private client: Client;
  private wallet: Wallet | null = null;
  private network: NetworkType;

  constructor(network: NetworkType = 'testnet') {
    this.network = network;
    this.client = new Client(NETWORK_URLS[network]);
  }

  /**
   * Connect to the XRPL network
   */
  async connect(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
      console.log(`Connected to XRPL ${this.network}`);
    }
  }

  /**
   * Disconnect from the XRPL network
   */
  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      await this.client.disconnect();
      console.log(`Disconnected from XRPL ${this.network}`);
    }
  }

  /**
   * Check if connected to the network
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Get the underlying xrpl.js Client
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Get the current network type
   */
  getNetwork(): NetworkType {
    return this.network;
  }

  /**
   * Set the wallet for signing transactions
   */
  setWallet(wallet: Wallet): void {
    this.wallet = wallet;
  }

  /**
   * Get the current wallet
   */
  getWallet(): Wallet | null {
    return this.wallet;
  }

  /**
   * Create a new wallet (random seed)
   */
  createWallet(): Wallet {
    const wallet = Wallet.generate();
    this.wallet = wallet;
    return wallet;
  }

  /**
   * Import a wallet from seed
   */
  importWallet(seed: string): Wallet {
    const wallet = Wallet.fromSeed(seed);
    this.wallet = wallet;
    return wallet;
  }

  /**
   * Fund a wallet using the testnet/devnet faucet
   * Only works on testnet and devnet
   */
  async fundWallet(wallet?: Wallet): Promise<{ wallet: Wallet; balance: number }> {
    const faucetUrl = FAUCET_URLS[this.network];
    if (!faucetUrl) {
      throw new Error(`Faucet not available for ${this.network}`);
    }

    const targetWallet = wallet || this.wallet;
    if (!targetWallet) {
      throw new Error('No wallet to fund');
    }

    await this.connect();

    const result = await this.client.fundWallet(targetWallet);
    return result;
  }

  /**
   * Get account balance in XRP
   */
  async getBalance(address?: string): Promise<string> {
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }

    await this.connect();

    try {
      const response = await this.client.request({
        command: 'account_info',
        account: targetAddress,
        ledger_index: 'validated',
      } as AccountInfoRequest);

      const balanceDrops = (response as AccountInfoResponse).result.account_data.Balance;
      return String(dropsToXrp(balanceDrops));
    } catch (error: any) {
      if (error.data?.error === 'actNotFound') {
        return '0';
      }
      throw error;
    }
  }

  /**
   * Get account info
   */
  async getAccountInfo(address?: string): Promise<AccountInfoResponse['result']> {
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address specified');
    }

    await this.connect();

    const response = await this.client.request({
      command: 'account_info',
      account: targetAddress,
      ledger_index: 'validated',
    } as AccountInfoRequest);

    return (response as AccountInfoResponse).result;
  }

  /**
   * Submit any signed transaction
   */
  async submitAnyTransaction(tx: SubmittableTransaction): Promise<TransactionResult> {
    if (!this.wallet) {
      throw new Error('No wallet set for signing');
    }

    await this.connect();

    // Autofill transaction fields (fee, sequence, etc.)
    const prepared = await this.client.autofill(tx);

    // Sign the transaction
    const signed = this.wallet.sign(prepared);

    // Submit and wait for validation
    const result = await this.client.submitAndWait(signed.tx_blob);

    return {
      hash: result.result.hash,
      result: (result.result as any).meta?.TransactionResult || 'unknown',
      ledger_index: result.result.ledger_index || 0,
      validated: result.result.validated || false,
    };
  }

  /**
   * Submit a Payment transaction
   */
  async submitTransaction(tx: Payment): Promise<TransactionResult> {
    return this.submitAnyTransaction(tx);
  }

  /**
   * Submit a memo transaction (for oracle commitments, votes, etc.)
   */
  async submitMemo(
    destination: string,
    memoType: string,
    memoData: string | object
  ): Promise<TransactionResult> {
    if (!this.wallet) {
      throw new Error('No wallet set for signing');
    }

    const dataString = typeof memoData === 'object'
      ? JSON.stringify(memoData)
      : memoData;

    const tx: Payment = {
      TransactionType: 'Payment',
      Account: this.wallet.address,
      Destination: destination,
      Amount: '1', // Minimum amount (1 drop)
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from(memoType).toString('hex').toUpperCase(),
            MemoData: Buffer.from(dataString).toString('hex').toUpperCase(),
          },
        },
      ],
    };

    return this.submitTransaction(tx);
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(hash: string): Promise<TxResponse> {
    await this.connect();

    const response = await this.client.request({
      command: 'tx',
      transaction: hash,
    });

    return response as TxResponse;
  }

  /**
   * Get current ledger index
   */
  async getLedgerIndex(): Promise<number> {
    await this.connect();

    const response = await this.client.request({
      command: 'ledger',
      ledger_index: 'validated',
    });

    return response.result.ledger_index;
  }

  /**
   * Convert XRP to drops
   */
  static xrpToDrops(xrp: string | number): string {
    return xrpToDrops(xrp);
  }

  /**
   * Convert drops to XRP
   */
  static dropsToXrp(drops: string | number): string {
    return String(dropsToXrp(drops));
  }
}

/**
 * Create and connect an XRPL client
 */
export async function createClient(network: NetworkType = 'testnet'): Promise<XRPLClient> {
  const client = new XRPLClient(network);
  await client.connect();
  return client;
}
