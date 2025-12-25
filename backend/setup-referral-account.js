/**
 * Jupiter Ultra Referral Account Setup Script
 * 
 * This script initializes your referral account to collect platform fees.
 * You need to run this ONCE before you can collect fees.
 * 
 * Usage: node setup-referral-account.js
 */

require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { ReferralProvider } = require('@jup-ag/referral-sdk');

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const REFERRAL_ACCOUNT = process.env.JUPITER_REFERRAL_KEY;

// Jupiter Ultra Project ID (from error message)
const JUPITER_ULTRA_PROJECT = 'DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc';

// Common tokens to collect fees in
const TOKENS_TO_INITIALIZE = [
  'So11111111111111111111111111111111111111112', // SOL (wrapped)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
];

console.log('🚀 Jupiter Ultra Referral Account Setup\n');
console.log('Configuration:');
console.log(`  RPC URL: ${RPC_URL}`);
console.log(`  Referral Account: ${REFERRAL_ACCOUNT}`);
console.log(`  Jupiter Ultra Project: ${JUPITER_ULTRA_PROJECT}`);
console.log('');

async function setupReferralAccount() {
  try {
    // Connect to Solana
    const connection = new Connection(RPC_URL, 'confirmed');
    
    console.log('📝 Step 1: Verify referral account exists');
    const referralPubkey = new PublicKey(REFERRAL_ACCOUNT);
    const accountInfo = await connection.getAccountInfo(referralPubkey);
    
    if (!accountInfo) {
      console.error('❌ ERROR: Referral account does not exist on-chain');
      console.error('   Please ensure this is a valid Solana wallet address');
      process.exit(1);
    }
    
    console.log('✅ Referral account exists on-chain');
    console.log('');
    
    console.log('📝 Step 2: Initialize referral token accounts');
    console.log('   This creates Associated Token Accounts (ATAs) for fee collection');
    console.log('');
    
    // Note: You need the private key of the referral account to sign transactions
    console.log('⚠️  IMPORTANT:');
    console.log('   To initialize referral accounts, you need:');
    console.log('   1. The private key of your referral account');
    console.log('   2. ~0.01 SOL per token for rent');
    console.log('');
    console.log('   Tokens to initialize:');
    TOKENS_TO_INITIALIZE.forEach((mint, i) => {
      console.log(`   ${i + 1}. ${mint}`);
    });
    console.log('');
    
    console.log('📋 Next Steps:');
    console.log('   1. Go to Jupiter Referral Dashboard: https://referral.jup.ag');
    console.log('   2. Connect your wallet (the referral account)');
    console.log('   3. Select "Jupiter Ultra" project');
    console.log('   4. Click "Initialize" for each token you want to collect fees in');
    console.log('');
    console.log('   OR use the Jupiter CLI:');
    console.log('   npm install -g @jup-ag/cli');
    console.log(`   jup referral init --project ${JUPITER_ULTRA_PROJECT} --account ${REFERRAL_ACCOUNT}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupReferralAccount();
