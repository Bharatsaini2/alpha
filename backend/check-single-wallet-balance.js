// Check ALPHA balance for a specific wallet
const { Connection, PublicKey } = require('@solana/web3.js');

const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump';
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ef5e9c05-c3bf-4179-91eb-07fd3a8b9b6b';
const WALLET_TO_CHECK = '5ATM1ywJ5fz24MSZC7WfGL8hfy1xV3yfAjAAugky5WYJ'; // Replace with actual wallet

async function checkWalletBalance() {
  try {
    console.log(`🔍 Checking ALPHA balance for wallet: ${WALLET_TO_CHECK}\n`);
    
    // Try to create PublicKey with better error handling
    let walletPubkey;
    try {
      walletPubkey = new PublicKey(WALLET_TO_CHECK);
      console.log('✅ Wallet address is valid');
      console.log(`   PublicKey: ${walletPubkey.toBase58()}\n`);
    } catch (pkError) {
      console.log('❌ PublicKey creation failed:', pkError.message);
      console.log('\nTrying alternative method...\n');
      
      // Try with Buffer
      const bs58 = require('bs58');
      const decoded = bs58.decode(WALLET_TO_CHECK);
      console.log(`Decoded bytes: ${decoded.length}`);
      walletPubkey = new PublicKey(decoded);
      console.log('✅ Created PublicKey from buffer\n');
    }

    const connection = new Connection(RPC_URL, 'confirmed');

    // Get token accounts
    console.log('Fetching token accounts...');
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: new PublicKey(ALPHA_TOKEN_MINT) }
    );

    console.log(`Found ${tokenAccounts.value.length} token account(s)\n`);

    if (tokenAccounts.value.length === 0) {
      console.log('❌ No ALPHA token account found for this wallet');
      console.log('   ALPHA Balance: 0');
      return;
    }

    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
    const alphaBalance = balance.uiAmount || 0;

    console.log('═'.repeat(60));
    console.log(`💰 ALPHA Balance: ${alphaBalance.toLocaleString()} ALPHA`);
    console.log('═'.repeat(60));
    console.log(`\nRequired for premium: 500,000 ALPHA`);
    
    if (alphaBalance >= 500000) {
      console.log(`✅ ELIGIBLE - Has ${alphaBalance.toLocaleString()} ALPHA`);
    } else {
      const needed = 500000 - alphaBalance;
      console.log(`❌ NOT ELIGIBLE - Needs ${needed.toLocaleString()} more ALPHA`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error type:', error.constructor.name);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

checkWalletBalance();
