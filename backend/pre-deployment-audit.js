/**
 * Split Swap Storage Architecture Fix - PRE-DEPLOYMENT Audit
 * 
 * This script audits the CURRENT state BEFORE deploying the fix.
 * It identifies what needs to be fixed and validates the deployment is needed.
 * 
 * Run with: node pre-deployment-audit.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  header: () => console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(80)}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.blue}## ${msg}${colors.reset}`),
  pass: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  data: (msg) => console.log(`  ${msg}`),
};

async function preDeploymentAudit() {
  log.header();
  console.log(`${colors.bright}${colors.cyan}  SPLIT SWAP ARCHITECTURE FIX - PRE-DEPLOYMENT AUDIT${colors.reset}`);
  log.header();
  
  try {
    // Connect
    log.section('Connecting to Database');
    await mongoose.connect(process.env.MONGO_URI);
    log.pass('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    log.info(`Database: ${db.databaseName}`);
    
    // Find the main whale transaction collection
    log.section('Identifying Transaction Collections');
    
    const candidateCollections = [
      'whalealltransactionv2',
      'whalealltransactions',
      'influencerwhaletransactionsv2',
      'whaleAllTransactionsV2' // Try camelCase too
    ];
    
    let mainCollection = null;
    let mainCollectionName = null;
    
    for (const name of candidateCollections) {
      try {
        const col = db.collection(name);
        const count = await col.countDocuments();
        if (count > 0) {
          log.info(`Found: ${name} (${count.toLocaleString()} documents)`);
          if (!mainCollection) {
            mainCollection = col;
            mainCollectionName = name;
          }
        }
      } catch (err) {
        // Collection doesn't exist, skip
      }
    }
    
    if (!mainCollection) {
      log.fail('No whale transaction collections found with data');
      log.warn('The Split Swap Architecture Fix requires transaction data to audit');
      return;
    }
    
    log.pass(`Using collection: ${mainCollectionName}`);
    
    // Audit current state
    log.section('Current State Analysis');
    
    const totalDocs = await mainCollection.countDocuments();
    log.info(`Total transactions: ${totalDocs.toLocaleString()}`);
    
    // Check type distribution
    const bothCount = await mainCollection.countDocuments({ type: 'both' });
    const sellCount = await mainCollection.countDocuments({ type: 'sell' });
    const buyCount = await mainCollection.countDocuments({ type: 'buy' });
    
    log.data(`Type="both": ${bothCount.toLocaleString()}`);
    log.data(`Type="sell": ${sellCount.toLocaleString()}`);
    log.data(`Type="buy": ${buyCount.toLocaleString()}`);
    
    // Check for classificationSource field
    log.section('Checking for Split Swap Architecture Fix Deployment');
    
    const withClassificationSource = await mainCollection.countDocuments({
      classificationSource: { $exists: true }
    });
    
    if (withClassificationSource === 0) {
      log.fail('classificationSource field NOT FOUND');
      log.warn('The Split Swap Architecture Fix has NOT been deployed yet');
      log.data('This is expected for pre-deployment audit');
    } else {
      log.pass(`Found ${withClassificationSource.toLocaleString()} records with classificationSource`);
      
      // Check for new split swap classification sources
      const newSplitSwaps = await mainCollection.countDocuments({
        classificationSource: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
      });
      
      if (newSplitSwaps > 0) {
        log.pass(`Found ${newSplitSwaps.toLocaleString()} records with new split swap classification`);
        log.info('The fix appears to be partially or fully deployed');
      } else {
        log.warn('classificationSource exists but no new split swap records found');
      }
    }
    
    // Analyze "both" type records
    log.section('Analyzing Type="both" Records');
    
    if (bothCount === 0) {
      log.info('No type="both" records found');
      log.data('This could mean:');
      log.data('  1. No split swaps have occurred');
      log.data('  2. The fix is already deployed');
      log.data('  3. Different transaction types are used');
    } else {
      log.warn(`Found ${bothCount.toLocaleString()} type="both" records`);
      log.data('These are candidates for the Split Swap Architecture Fix');
      
      // Sample a "both" record to analyze structure
      const sampleBoth = await mainCollection.findOne({ type: 'both' });
      
      if (sampleBoth) {
        log.info('Sample type="both" record structure:');
        log.data(`  Signature: ${sampleBoth.signature?.substring(0, 16)}...`);
        log.data(`  Has amount field: ${!!sampleBoth.amount}`);
        log.data(`  Has solAmount field: ${!!sampleBoth.solAmount}`);
        log.data(`  Has transaction field: ${!!sampleBoth.transaction}`);
        log.data(`  Has classificationSource: ${!!sampleBoth.classificationSource}`);
        
        if (sampleBoth.amount) {
          log.data(`  amount.buyAmount: ${sampleBoth.amount.buyAmount}`);
          log.data(`  amount.sellAmount: ${sampleBoth.amount.sellAmount}`);
        }
        
        if (sampleBoth.solAmount) {
          log.data(`  solAmount.buySolAmount: ${sampleBoth.solAmount.buySolAmount}`);
          log.data(`  solAmount.sellSolAmount: ${sampleBoth.solAmount.sellSolAmount}`);
        }
        
        if (sampleBoth.transaction) {
          log.data(`  transaction.tokenIn.symbol: ${sampleBoth.transaction.tokenIn?.symbol}`);
          log.data(`  transaction.tokenOut.symbol: ${sampleBoth.transaction.tokenOut?.symbol}`);
        }
      }
    }
    
    // Check for compound unique index
    log.section('Checking Database Schema');
    
    const indexes = await mainCollection.indexes();
    const compoundIndex = indexes.find(idx => 
      idx.key.signature === 1 && 
      idx.key.type === 1 &&
      idx.unique === true
    );
    
    if (compoundIndex) {
      log.pass('Compound unique index (signature, type) exists');
      log.data(`Index name: ${compoundIndex.name}`);
    } else {
      log.fail('Compound unique index (signature, type) NOT FOUND');
      log.warn('Phase A of the deployment has not been completed');
      
      // Check if signature is still unique
      const signatureIndex = indexes.find(idx => 
        idx.key.signature === 1 && idx.unique === true
      );
      
      if (signatureIndex) {
        log.warn('Old unique index on signature field still exists');
        log.data('This will prevent storing two records with the same signature');
        log.data('Phase A schema migration is REQUIRED before deployment');
      }
    }
    
    // Recommendations
    log.section('Pre-Deployment Recommendations');
    
    if (withClassificationSource === 0 && !compoundIndex) {
      log.warn('DEPLOYMENT NOT STARTED');
      log.data('');
      log.data('Next steps:');
      log.data('1. Deploy Phase A: Schema changes and utilities');
      log.data('   - Remove unique constraint on signature');
      log.data('   - Add compound unique index (signature, type)');
      log.data('   - Deploy utility functions');
      log.data('   - Deploy model-level validation');
      log.data('');
      log.data('2. Deploy Phase B: Controller fix');
      log.data('   - Update whale controller to create separate records');
      log.data('   - Add atomic transaction wrapping');
      log.data('');
      log.data('3. Deploy Phase C: Query updates');
      log.data('4. Deploy Phase D: API aggregation layer');
      log.data('');
      log.data(`Estimated records to migrate: ${bothCount.toLocaleString()} (if migration is run)`);
    } else if (compoundIndex && withClassificationSource > 0) {
      log.pass('DEPLOYMENT APPEARS COMPLETE');
      log.data('');
      log.data('Run the post-deployment audit to verify:');
      log.data('  node audit-split-swap-architecture.js');
    } else {
      log.warn('PARTIAL DEPLOYMENT DETECTED');
      log.data('');
      log.data('Review deployment status:');
      log.data(`  - Compound index: ${compoundIndex ? 'YES' : 'NO'}`);
      log.data(`  - classificationSource field: ${withClassificationSource > 0 ? 'YES' : 'NO'}`);
      log.data('');
      log.data('Complete remaining deployment phases');
    }
    
    log.header();
    
  } catch (error) {
    console.error(`\n${colors.red}Audit failed:${colors.reset}`, error.message);
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

preDeploymentAudit().catch(console.error);
