/**
 * Whale Alert Diagnostic Script
 * 
 * This script investigates why whale alerts are not being sent to Telegram.
 * It checks:
 * 1. Alert configuration in database
 * 2. Recent matching transactions
 * 3. Alert matching logic
 * 4. Telegram service status
 * 5. Alert matcher subscription cache
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const { UserAlert } = require('./dist/models/userAlert.model');
const { User } = require('./dist/models/user.model');
const whaleAllTransactionModelV2 = require('./dist/models/whaleAllTransactionsV2.model').default;

// Import services
const { alertMatcherService } = require('./dist/services/alertMatcher.service');
const { telegramService } = require('./dist/services/telegram.service');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(emoji, color, title, data = null) {
  console.log(`\n${emoji} ${color}${colors.bright}${title}${colors.reset}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function section(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log('='.repeat(80));
}

async function connectDatabase() {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('MONGO_URI not found in environment variables');
    }
    
    await mongoose.connect(mongoURI, {
      maxPoolSize: 30,
    });
    
    log('✅', colors.green, 'Database connected successfully');
    return true;
  } catch (error) {
    log('❌', colors.red, 'Database connection failed', {
      error: error.message,
    });
    return false;
  }
}

async function checkAlertConfiguration(userId = null) {
  section('1. ALERT CONFIGURATION IN DATABASE');
  
  try {
    // Find all whale alerts (ALPHA_STREAM type)
    const query = { type: 'ALPHA_STREAM' };
    if (userId) {
      query.userId = userId;
    }
    
    const alerts = await UserAlert.find(query)
      .populate('userId', 'telegramChatId displayName email')
      .lean();
    
    if (alerts.length === 0) {
      log('⚠️', colors.yellow, 'No ALPHA_STREAM alerts found in database');
      return [];
    }
    
    log('📊', colors.blue, `Found ${alerts.length} ALPHA_STREAM alert(s)`);
    
    for (const alert of alerts) {
      const user = alert.userId;
      
      console.log(`\n${colors.bright}Alert ID:${colors.reset} ${alert._id}`);
      console.log(`${colors.bright}User:${colors.reset} ${user?.displayName || user?.email || 'Unknown'}`);
      console.log(`${colors.bright}User ID:${colors.reset} ${alert.userId._id || alert.userId}`);
      console.log(`${colors.bright}Telegram Chat ID:${colors.reset} ${user?.telegramChatId || '❌ NOT SET'}`);
      console.log(`${colors.bright}Status:${colors.reset} ${alert.enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      console.log(`${colors.bright}Priority:${colors.reset} ${alert.priority}`);
      console.log(`${colors.bright}Created:${colors.reset} ${alert.createdAt}`);
      
      console.log(`\n${colors.bright}Configuration:${colors.reset}`);
      console.log(`  Hotness Score Threshold: ${alert.config.hotnessScoreThreshold ?? 'NOT SET'}`);
      console.log(`  Min Buy Amount USD: $${alert.config.minBuyAmountUSD ?? 'NOT SET'}`);
      console.log(`  Wallet Labels: ${alert.config.walletLabels?.join(', ') || 'NOT SET'}`);
      
      // Check for issues
      const issues = [];
      if (!alert.enabled) {
        issues.push('❌ Alert is DISABLED');
      }
      if (!user?.telegramChatId) {
        issues.push('❌ User has NO Telegram chat ID linked');
      }
      if (alert.config.hotnessScoreThreshold === undefined && 
          alert.config.minBuyAmountUSD === undefined && 
          (!alert.config.walletLabels || alert.config.walletLabels.length === 0)) {
        issues.push('⚠️ No filters configured (will match all transactions)');
      }
      
      if (issues.length > 0) {
        console.log(`\n${colors.red}${colors.bright}Issues:${colors.reset}`);
        issues.forEach(issue => console.log(`  ${issue}`));
      } else {
        console.log(`\n${colors.green}✅ Alert configuration looks good${colors.reset}`);
      }
    }
    
    return alerts;
  } catch (error) {
    log('❌', colors.red, 'Error checking alert configuration', {
      error: error.message,
      stack: error.stack,
    });
    return [];
  }
}

async function checkRecentTransactions(timeWindowMinutes = 10) {
  section('2. RECENT MATCHING TRANSACTIONS');
  
  try {
    const timeWindowStart = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    
    // Query recent buy transactions
    const transactions = await whaleAllTransactionModelV2
      .find({
        type: 'buy',
        timestamp: { $gte: timeWindowStart },
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
    
    if (transactions.length === 0) {
      log('⚠️', colors.yellow, `No buy transactions found in last ${timeWindowMinutes} minutes`);
      return [];
    }
    
    log('📊', colors.blue, `Found ${transactions.length} buy transaction(s) in last ${timeWindowMinutes} minutes`);
    
    for (const tx of transactions) {
      const buyAmountUSD = parseFloat(tx.transaction.tokenOut.usdAmount || '0');
      const hotnessScore = tx.hotnessScore || 0;
      const walletLabels = tx.whale.labels || tx.whaleLabel || [];
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`${colors.bright}Transaction:${colors.reset} ${tx.signature.substring(0, 16)}...`);
      console.log(`${colors.bright}Timestamp:${colors.reset} ${tx.timestamp}`);
      console.log(`${colors.bright}Type:${colors.reset} ${tx.type}`);
      console.log(`${colors.bright}Hotness Score:${colors.reset} ${hotnessScore}/10`);
      console.log(`${colors.bright}Buy Amount USD:${colors.reset} $${buyAmountUSD.toLocaleString()}`);
      console.log(`${colors.bright}Wallet Address:${colors.reset} ${tx.whale.address}`);
      console.log(`${colors.bright}Wallet Labels:${colors.reset} ${walletLabels.join(', ') || 'NONE'}`);
      console.log(`${colors.bright}Token:${colors.reset} ${tx.transaction.tokenOut.symbol || 'Unknown'}`);
      console.log(`${colors.bright}Token Address:${colors.reset} ${tx.transaction.tokenOut.address || tx.tokenOutAddress}`);
      
      // Check if it would match common criteria
      const matchesCriteria = {
        hotnessGte0: hotnessScore >= 0,
        buyAmountGte10: buyAmountUSD >= 10,
        hasFlipperLabel: walletLabels.includes('FLIPPER'),
        hasSniperLabel: walletLabels.includes('SNIPER'),
      };
      
      console.log(`\n${colors.bright}Matching Criteria:${colors.reset}`);
      console.log(`  Hotness >= 0: ${matchesCriteria.hotnessGte0 ? '✅' : '❌'}`);
      console.log(`  Buy Amount >= $10: ${matchesCriteria.buyAmountGte10 ? '✅' : '❌'}`);
      console.log(`  Has FLIPPER label: ${matchesCriteria.hasFlipperLabel ? '✅' : '❌'}`);
      console.log(`  Has SNIPER label: ${matchesCriteria.hasSniperLabel ? '✅' : '❌'}`);
    }
    
    return transactions;
  } catch (error) {
    log('❌', colors.red, 'Error checking recent transactions', {
      error: error.message,
      stack: error.stack,
    });
    return [];
  }
}

async function testAlertMatching(alerts, transactions) {
  section('3. TEST ALERT MATCHING LOGIC');
  
  if (alerts.length === 0 || transactions.length === 0) {
    log('⚠️', colors.yellow, 'Skipping - no alerts or transactions to test');
    return;
  }
  
  try {
    log('🧪', colors.magenta, 'Testing evaluateWhaleAlert() for each transaction');
    
    for (const alert of alerts) {
      console.log(`\n${colors.cyan}${colors.bright}Testing Alert: ${alert._id}${colors.reset}`);
      console.log(`Config: Hotness >= ${alert.config.hotnessScoreThreshold ?? 'ANY'}, ` +
                  `Buy >= $${alert.config.minBuyAmountUSD ?? 'ANY'}, ` +
                  `Labels: ${alert.config.walletLabels?.join(', ') || 'ANY'}`);
      
      let matchCount = 0;
      
      for (const tx of transactions) {
        // Manually evaluate the matching logic
        const hotnessScore = tx.hotnessScore || 0;
        const buyAmountUSD = parseFloat(tx.transaction.tokenOut.usdAmount || '0');
        const txLabels = tx.whale.labels || tx.whaleLabel || [];
        
        let matches = true;
        const reasons = [];
        
        // Check hotness score
        if (alert.config.hotnessScoreThreshold !== undefined) {
          if (hotnessScore < alert.config.hotnessScoreThreshold) {
            matches = false;
            reasons.push(`Hotness ${hotnessScore} < ${alert.config.hotnessScoreThreshold}`);
          }
        }
        
        // Check min buy amount
        if (alert.config.minBuyAmountUSD !== undefined && alert.config.minBuyAmountUSD > 0) {
          if (buyAmountUSD < alert.config.minBuyAmountUSD) {
            matches = false;
            reasons.push(`Buy $${buyAmountUSD.toFixed(2)} < $${alert.config.minBuyAmountUSD}`);
          }
        }
        
        // Check wallet labels (OR logic)
        if (alert.config.walletLabels && alert.config.walletLabels.length > 0) {
          const hasMatchingLabel = txLabels.some(label => 
            alert.config.walletLabels.includes(label)
          );
          if (!hasMatchingLabel) {
            matches = false;
            reasons.push(`Labels [${txLabels.join(', ')}] don't match [${alert.config.walletLabels.join(', ')}]`);
          }
        }
        
        if (matches) {
          matchCount++;
          console.log(`  ✅ ${tx.signature.substring(0, 16)}... - MATCHES`);
        } else {
          console.log(`  ❌ ${tx.signature.substring(0, 16)}... - NO MATCH: ${reasons.join(', ')}`);
        }
      }
      
      console.log(`\n${colors.bright}Result:${colors.reset} ${matchCount}/${transactions.length} transactions matched`);
      
      if (matchCount === 0) {
        log('⚠️', colors.yellow, 'No transactions matched this alert configuration');
      } else {
        log('✅', colors.green, `${matchCount} transaction(s) should have triggered alerts`);
      }
    }
  } catch (error) {
    log('❌', colors.red, 'Error testing alert matching', {
      error: error.message,
      stack: error.stack,
    });
  }
}

async function checkTelegramService() {
  section('4. TELEGRAM SERVICE STATUS');
  
  try {
    // Check if bot token is configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      log('❌', colors.red, 'TELEGRAM_BOT_TOKEN not found in environment variables');
      return;
    }
    
    log('✅', colors.green, 'TELEGRAM_BOT_TOKEN is configured');
    
    // Try to get metrics from telegram service
    try {
      const metrics = telegramService.getMetrics();
      
      console.log(`\n${colors.bright}Queue Status:${colors.reset}`);
      console.log(`  Size: ${metrics.queue.size}/${metrics.queue.capacity}`);
      console.log(`  Utilization: ${metrics.queue.utilizationPercent}%`);
      console.log(`  Messages Processed: ${metrics.queue.messagesProcessed}`);
      console.log(`  Messages Dropped: ${metrics.queue.messagesDropped}`);
      console.log(`  In Backpressure: ${metrics.queue.isInBackpressure ? '⚠️ YES' : '✅ NO'}`);
      
      console.log(`\n${colors.bright}Delivery Status:${colors.reset}`);
      console.log(`  Total Delivered: ${metrics.delivery.totalDelivered}`);
      console.log(`  Total Failed: ${metrics.delivery.totalFailed}`);
      console.log(`  Success Rate: ${metrics.delivery.successRate}%`);
      console.log(`  Average Latency: ${metrics.delivery.averageLatencyMs}ms`);
      console.log(`  Last Delivery: ${metrics.delivery.lastDeliveryAt ? new Date(metrics.delivery.lastDeliveryAt).toISOString() : 'NEVER'}`);
      
      console.log(`\n${colors.bright}Service Status:${colors.reset}`);
      console.log(`  Initialized: ${metrics.status.isInitialized ? '✅ YES' : '❌ NO'}`);
      console.log(`  Shutting Down: ${metrics.status.isShuttingDown ? '⚠️ YES' : '✅ NO'}`);
      
      if (!metrics.status.isInitialized) {
        log('❌', colors.red, 'Telegram service is NOT initialized');
      } else {
        log('✅', colors.green, 'Telegram service is initialized and running');
      }
    } catch (error) {
      log('⚠️', colors.yellow, 'Could not get telegram service metrics (service may not be initialized)', {
        error: error.message,
      });
    }
  } catch (error) {
    log('❌', colors.red, 'Error checking telegram service', {
      error: error.message,
      stack: error.stack,
    });
  }
}

async function checkAlertMatcherCache() {
  section('5. ALERT MATCHER SUBSCRIPTION CACHE');
  
  try {
    const metrics = alertMatcherService.getMetrics();
    
    console.log(`\n${colors.bright}Subscription Cache:${colors.reset}`);
    console.log(`  ALPHA_STREAM: ${metrics.caches.subscription.alphaStreamCount}`);
    console.log(`  WHALE_CLUSTER: ${metrics.caches.subscription.whaleClusterCount}`);
    console.log(`  KOL_ACTIVITY: ${metrics.caches.subscription.kolActivityCount}`);
    console.log(`  Total: ${metrics.caches.subscription.totalSubscriptions}`);
    
    console.log(`\n${colors.bright}Matching Statistics:${colors.reset}`);
    console.log(`  Total Matches: ${metrics.matching.totalMatches}`);
    console.log(`  Total Processed: ${metrics.matching.totalProcessed}`);
    console.log(`  Average Latency: ${metrics.matching.averageLatencyMs}ms`);
    console.log(`  Last Processed: ${metrics.matching.lastProcessedAt ? new Date(metrics.matching.lastProcessedAt).toISOString() : 'NEVER'}`);
    
    console.log(`\n${colors.bright}Cache Performance:${colors.reset}`);
    console.log(`  Cluster Cache: ${metrics.caches.cluster.size} entries, ${metrics.caches.cluster.hitRate}% hit rate`);
    console.log(`  Token Symbol Cache: ${metrics.caches.tokenSymbol.size} entries, ${metrics.caches.tokenSymbol.hitRate}% hit rate`);
    
    console.log(`\n${colors.bright}Service Status:${colors.reset}`);
    console.log(`  Initialized: ${metrics.status.isInitialized ? '✅ YES' : '❌ NO'}`);
    
    if (!metrics.status.isInitialized) {
      log('❌', colors.red, 'Alert matcher service is NOT initialized');
    } else if (metrics.caches.subscription.alphaStreamCount === 0) {
      log('⚠️', colors.yellow, 'Alert matcher has NO ALPHA_STREAM subscriptions in cache');
      log('💡', colors.cyan, 'This could mean:');
      console.log('  1. No alerts are enabled in the database');
      console.log('  2. Users have no Telegram chat ID linked');
      console.log('  3. The cache sync has not run yet (runs every 2 minutes)');
    } else {
      log('✅', colors.green, 'Alert matcher service is initialized with subscriptions');
    }
  } catch (error) {
    log('❌', colors.red, 'Error checking alert matcher cache', {
      error: error.message,
      stack: error.stack,
    });
  }
}

function provideDiagnosticSummary(alerts, transactions) {
  section('DIAGNOSTIC SUMMARY & RECOMMENDATIONS');
  
  const issues = [];
  const recommendations = [];
  
  // Check for common issues
  if (alerts.length === 0) {
    issues.push('❌ No ALPHA_STREAM alerts found in database');
    recommendations.push('Create a whale alert from the frontend');
  } else {
    const enabledAlerts = alerts.filter(a => a.enabled);
    if (enabledAlerts.length === 0) {
      issues.push('❌ All alerts are DISABLED');
      recommendations.push('Enable at least one alert from the user profile');
    }
    
    const alertsWithTelegram = alerts.filter(a => a.userId.telegramChatId);
    if (alertsWithTelegram.length === 0) {
      issues.push('❌ No users have Telegram linked');
      recommendations.push('Link Telegram account from the user profile');
    }
  }
  
  if (transactions.length === 0) {
    issues.push('⚠️ No recent buy transactions found');
    recommendations.push('Wait for whale tracker to process new transactions');
  }
  
  // Check telegram service
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    issues.push('❌ TELEGRAM_BOT_TOKEN not configured');
    recommendations.push('Add TELEGRAM_BOT_TOKEN to .env file');
  }
  
  if (issues.length === 0) {
    log('✅', colors.green, 'No critical issues found!');
    console.log('\nIf alerts are still not working, check:');
    console.log('  1. Backend server logs for errors');
    console.log('  2. Whale tracker is actively processing transactions');
    console.log('  3. Alert matcher service is initialized (check startup logs)');
    console.log('  4. Telegram bot is not blocked by user');
  } else {
    log('⚠️', colors.yellow, 'Issues Found:');
    issues.forEach(issue => console.log(`  ${issue}`));
    
    log('💡', colors.cyan, '\nRecommendations:');
    recommendations.forEach(rec => console.log(`  • ${rec}`));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`${colors.green}${colors.bright}Diagnostic complete!${colors.reset}`);
  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log(`${colors.cyan}${colors.bright}🐋 WHALE ALERT DIAGNOSTIC SCRIPT${colors.reset}`);
  console.log('='.repeat(80));
  
  // Connect to database
  const connected = await connectDatabase();
  if (!connected) {
    console.error('Cannot proceed without database connection');
    process.exit(1);
  }
  
  // Run diagnostics
  const alerts = await checkAlertConfiguration();
  const transactions = await checkRecentTransactions(10);
  await testAlertMatching(alerts, transactions);
  await checkTelegramService();
  await checkAlertMatcherCache();
  
  // Provide summary
  provideDiagnosticSummary(alerts, transactions);
  
  // Close database connection
  await mongoose.connection.close();
  log('✅', colors.green, 'Database connection closed');
  
  process.exit(0);
}

// Run the diagnostic
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
