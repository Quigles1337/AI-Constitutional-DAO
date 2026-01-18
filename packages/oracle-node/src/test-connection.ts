/**
 * Test script for XRPL Testnet connection
 *
 * Run with: npx ts-node src/test-connection.ts
 */

import { createClient } from './xrpl/client';
import { EscrowManager } from './xrpl/escrow';

async function main() {
  console.log('='.repeat(60));
  console.log('AI Constitution DAO - XRPL Testnet Connection Test');
  console.log('='.repeat(60));

  // Create and connect client
  console.log('\n1. Connecting to XRPL Testnet...');
  const client = await createClient('testnet');
  console.log('   Connected!');

  // Get current ledger
  const ledgerIndex = await client.getLedgerIndex();
  console.log(`   Current ledger index: ${ledgerIndex}`);

  // Create a wallet
  console.log('\n2. Creating test wallet...');
  const wallet = client.createWallet();
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Seed: ${wallet.seed}`);

  // Fund the wallet
  console.log('\n3. Funding wallet from testnet faucet...');
  const { balance } = await client.fundWallet(wallet);
  console.log(`   Funded! Balance: ${balance} XRP`);

  // Check balance
  const currentBalance = await client.getBalance();
  console.log(`   Verified balance: ${currentBalance} XRP`);

  // Get account info
  console.log('\n4. Getting account info...');
  const accountInfo = await client.getAccountInfo();
  console.log(`   Sequence: ${accountInfo.account_data.Sequence}`);
  console.log(`   Balance (drops): ${accountInfo.account_data.Balance}`);

  // Test memo transaction
  console.log('\n5. Testing memo transaction...');
  const testMemo = {
    test: true,
    timestamp: Date.now(),
    message: 'AI Constitution DAO test',
  };

  try {
    // Send a test memo to self
    const response = await client.submitMemo(
      wallet.address,
      'TEST_MEMO',
      testMemo
    );
    console.log(`   Transaction submitted!`);
    console.log(`   Hash: ${response.hash}`);
    console.log(`   Result: ${response.result}`);
  } catch (error: any) {
    console.log(`   Error: ${error.message}`);
  }

  // Test escrow manager setup
  console.log('\n6. Testing EscrowManager setup...');
  const treasuryAddress = wallet.address; // Use same address for testing
  const escrowManager = new EscrowManager(client, treasuryAddress);
  console.log('   EscrowManager initialized');

  // Get any existing escrows
  const escrows = await escrowManager.getEscrows();
  console.log(`   Existing escrows: ${escrows.length}`);

  // Disconnect
  console.log('\n7. Disconnecting...');
  await client.disconnect();
  console.log('   Disconnected!');

  console.log('\n' + '='.repeat(60));
  console.log('Test completed successfully!');
  console.log('='.repeat(60));

  // Summary for user
  console.log('\n📝 Save these credentials for testing:');
  console.log(`   XRPL_WALLET_ADDRESS=${wallet.address}`);
  console.log(`   XRPL_WALLET_SEED=${wallet.seed}`);
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
