/**
 * KOL Alert Test Script
 * Tests the complete KOL alert flow: create, retrieve, format, and delete
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:9090/api/v1';

// ANSI color codes for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60));
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

// Test configuration
const TEST_CONFIG = {
    // Replace with your actual access token
    accessToken: process.env.TEST_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE',
    
    // Test alert configuration
    hotnessScoreThreshold: 5,
    minBuyAmountUSD: 1000,
};

let createdAlertId = null;

/**
 * Test 1: Check Authentication
 */
async function testAuthentication() {
    logSection('TEST 1: Authentication Check');
    
    try {
        const response = await axios.get(`${BASE_URL}/auth/me`, {
            headers: {
                Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
            },
        });
        
        if (response.data.success && response.data.user) {
            logSuccess('Authentication successful');
            logInfo(`User ID: ${response.data.user._id}`);
            logInfo(`Telegram Connected: ${response.data.user.telegramChatId ? 'Yes' : 'No'}`);
            
            if (!response.data.user.telegramChatId) {
                logWarning('Telegram not connected. You need to connect Telegram to receive alerts.');
            }
            
            return response.data.user;
        } else {
            logError('Authentication failed');
            return null;
        }
    } catch (error) {
        logError(`Authentication error: ${error.response?.data?.message || error.message}`);
        return null;
    }
}

/**
 * Test 2: Check Premium Access
 */
async function testPremiumAccess() {
    logSection('TEST 2: Premium Access Check');
    
    try {
        const response = await axios.get(`${BASE_URL}/alerts/premium-access`, {
            headers: {
                Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
            },
        });
        
        if (response.data.success) {
            const { hasAccess, currentBalance, requiredBalance, difference } = response.data.data;
            
            if (hasAccess) {
                logSuccess('Premium access granted');
                logInfo(`Current balance: ${currentBalance} ALPHA tokens`);
            } else {
                logError('Insufficient premium access');
                logInfo(`Current balance: ${currentBalance} ALPHA tokens`);
                logInfo(`Required balance: ${requiredBalance} ALPHA tokens`);
                logInfo(`Difference: ${difference} ALPHA tokens needed`);
            }
            
            return hasAccess;
        } else {
            logError('Failed to check premium access');
            return false;
        }
    } catch (error) {
        logError(`Premium access check error: ${error.response?.data?.message || error.message}`);
        return false;
    }
}

/**
 * Test 3: Create KOL Alert
 */
async function testCreateKOLAlert() {
    logSection('TEST 3: Create KOL Alert');
    
    try {
        logInfo('Creating KOL alert with config:');
        logInfo(`  Hotness Score Threshold: ${TEST_CONFIG.hotnessScoreThreshold}`);
        logInfo(`  Min Buy Amount: $${TEST_CONFIG.minBuyAmountUSD}`);
        
        const response = await axios.post(
            `${BASE_URL}/alerts/kol-alert`,
            {
                hotnessScoreThreshold: TEST_CONFIG.hotnessScoreThreshold,
                minBuyAmountUSD: TEST_CONFIG.minBuyAmountUSD,
            },
            {
                headers: {
                    Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
                },
            }
        );
        
        if (response.data.success) {
            createdAlertId = response.data.data.alertId;
            logSuccess('KOL alert created successfully');
            logInfo(`Alert ID: ${createdAlertId}`);
            logInfo(`Alert Type: ${response.data.data.type}`);
            logInfo(`Created At: ${response.data.data.createdAt}`);
            
            return response.data.data;
        } else {
            logError('Failed to create KOL alert');
            return null;
        }
    } catch (error) {
        logError(`Create KOL alert error: ${error.response?.data?.message || error.message}`);
        if (error.response?.data) {
            console.log('Error details:', error.response.data);
        }
        return null;
    }
}

/**
 * Test 4: Retrieve KOL Alerts
 */
async function testGetKOLAlerts() {
    logSection('TEST 4: Retrieve KOL Alerts');
    
    try {
        const response = await axios.get(`${BASE_URL}/alerts/kol-alerts`, {
            headers: {
                Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
            },
        });
        
        if (response.data.success) {
            const alerts = response.data.data.alerts;
            logSuccess(`Retrieved ${alerts.length} KOL alert(s)`);
            
            alerts.forEach((alert, index) => {
                logInfo(`\nAlert ${index + 1}:`);
                logInfo(`  ID: ${alert._id}`);
                logInfo(`  Type: ${alert.type}`);
                logInfo(`  Priority: ${alert.priority}`);
                logInfo(`  Enabled: ${alert.enabled}`);
                logInfo(`  Hotness: ${alert.config.hotnessScoreThreshold}/10`);
                logInfo(`  Min Amount: $${alert.config.minBuyAmountUSD}`);
            });
            
            return alerts;
        } else {
            logError('Failed to retrieve KOL alerts');
            return [];
        }
    } catch (error) {
        logError(`Get KOL alerts error: ${error.response?.data?.message || error.message}`);
        return [];
    }
}

/**
 * Test 5: Retrieve All Alerts (Combined)
 */
async function testGetAllAlerts() {
    logSection('TEST 5: Retrieve All Alerts (Whale + KOL)');
    
    try {
        const response = await axios.get(`${BASE_URL}/alerts/my-alerts`, {
            headers: {
                Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
            },
        });
        
        if (response.data.success) {
            const alerts = response.data.data.alerts;
            logSuccess(`Retrieved ${alerts.length} total alert(s)`);
            
            const whaleAlerts = alerts.filter(a => a.type === 'ALPHA_STREAM');
            const kolAlerts = alerts.filter(a => a.type === 'KOL_ACTIVITY');
            
            logInfo(`  Whale Alerts: ${whaleAlerts.length}`);
            logInfo(`  KOL Alerts: ${kolAlerts.length}`);
            
            alerts.forEach((alert, index) => {
                const alertType = alert.type === 'ALPHA_STREAM' ? 'Whale Alert' : 
                                 alert.type === 'KOL_ACTIVITY' ? 'KOL Alert' : 
                                 alert.type;
                logInfo(`\n${index + 1}. ${alertType}`);
                logInfo(`   ID: ${alert.id}`);
                logInfo(`   Priority: ${alert.priority}`);
                logInfo(`   Enabled: ${alert.enabled}`);
            });
            
            return alerts;
        } else {
            logError('Failed to retrieve all alerts');
            return [];
        }
    } catch (error) {
        logError(`Get all alerts error: ${error.response?.data?.message || error.message}`);
        return [];
    }
}

/**
 * Test 6: Test KOL Alert Format
 */
async function testKOLAlertFormat() {
    logSection('TEST 6: Test KOL Alert Format');
    
    try {
        // Import the format function
        const { formatKOLAlert } = require('./src/utils/telegram.utils');
        
        // Mock KOL transaction data
        const mockTransaction = {
            type: 'buy',
            signature: '5test123signature456',
            timestamp: new Date(),
            hotnessScore: 7.5,
            transaction: {
                tokenOut: {
                    symbol: 'TEST',
                    name: 'Test Token',
                    address: 'TestTokenAddress123456789',
                    usdAmount: '5000',
                    marketCap: '1000000',
                },
                tokenIn: {
                    symbol: 'SOL',
                    name: 'Solana',
                    address: 'So11111111111111111111111111111111111111112',
                    usdAmount: '5000',
                },
            },
            marketCap: {
                buyMarketCap: '1000000',
            },
        };
        
        const kolName = 'Test KOL';
        const kolUsername = 'testkol';
        
        logInfo('Generating KOL alert message...');
        const message = formatKOLAlert(kolName, mockTransaction, 'TEST', kolUsername);
        
        logSuccess('KOL alert format generated successfully');
        console.log('\n' + '-'.repeat(60));
        log('TELEGRAM MESSAGE PREVIEW:', 'yellow');
        console.log('-'.repeat(60));
        console.log(message);
        console.log('-'.repeat(60));
        
        // Verify format contains required elements
        const checks = [
            { name: 'Contains "KOL Buy Alert"', test: message.includes('KOL Buy Alert') },
            { name: 'Contains KOL name', test: message.includes(kolName) },
            { name: 'Contains token name', test: message.includes('Test Token') },
            { name: 'Contains buy amount emoji', test: message.includes('💰') },
            { name: 'Contains hotness emoji', test: message.includes('🔥') },
            { name: 'Contains whale emoji', test: message.includes('🐋') },
            { name: 'Contains "Powered by"', test: message.includes('Powered by') },
        ];
        
        console.log('\n' + 'Format Validation:');
        checks.forEach(check => {
            if (check.test) {
                logSuccess(check.name);
            } else {
                logError(check.name);
            }
        });
        
        return true;
    } catch (error) {
        logError(`Format test error: ${error.message}`);
        console.log(error.stack);
        return false;
    }
}

/**
 * Test 7: Delete KOL Alert
 */
async function testDeleteKOLAlert() {
    logSection('TEST 7: Delete KOL Alert');
    
    if (!createdAlertId) {
        logWarning('No alert ID to delete. Skipping delete test.');
        return false;
    }
    
    try {
        logInfo(`Deleting KOL alert: ${createdAlertId}`);
        
        const response = await axios.delete(
            `${BASE_URL}/alerts/kol-alert/${createdAlertId}`,
            {
                headers: {
                    Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
                },
            }
        );
        
        if (response.data.success) {
            logSuccess('KOL alert deleted successfully');
            return true;
        } else {
            logError('Failed to delete KOL alert');
            return false;
        }
    } catch (error) {
        logError(`Delete KOL alert error: ${error.response?.data?.message || error.message}`);
        return false;
    }
}

/**
 * Test 8: Verify Deletion
 */
async function testVerifyDeletion() {
    logSection('TEST 8: Verify Deletion');
    
    try {
        const response = await axios.get(`${BASE_URL}/alerts/kol-alerts`, {
            headers: {
                Authorization: `Bearer ${TEST_CONFIG.accessToken}`,
            },
        });
        
        if (response.data.success) {
            const alerts = response.data.data.alerts;
            const deletedAlert = alerts.find(a => a._id === createdAlertId);
            
            if (!deletedAlert) {
                logSuccess('Alert successfully removed from list');
                return true;
            } else {
                logError('Alert still exists in list');
                return false;
            }
        } else {
            logError('Failed to verify deletion');
            return false;
        }
    } catch (error) {
        logError(`Verify deletion error: ${error.response?.data?.message || error.message}`);
        return false;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n');
    log('╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║          KOL ALERT SYSTEM - COMPREHENSIVE TEST            ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝', 'bright');
    
    // Check if access token is set
    if (TEST_CONFIG.accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
        logError('\n❌ ACCESS TOKEN NOT SET!');
        logInfo('Please set TEST_ACCESS_TOKEN in .env file or update the script');
        logInfo('You can get your access token from localStorage after logging in');
        process.exit(1);
    }
    
    const results = {
        passed: 0,
        failed: 0,
        skipped: 0,
    };
    
    try {
        // Test 1: Authentication
        const user = await testAuthentication();
        if (!user) {
            logError('\n❌ Authentication failed. Cannot continue tests.');
            process.exit(1);
        }
        results.passed++;
        
        // Test 2: Premium Access
        const hasAccess = await testPremiumAccess();
        if (hasAccess) {
            results.passed++;
        } else {
            results.failed++;
            logWarning('Continuing tests despite insufficient premium access...');
        }
        
        // Test 3: Create KOL Alert
        const alert = await testCreateKOLAlert();
        if (alert) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Test 4: Get KOL Alerts
        const kolAlerts = await testGetKOLAlerts();
        if (kolAlerts.length > 0) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Test 5: Get All Alerts
        const allAlerts = await testGetAllAlerts();
        if (allAlerts.length > 0) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Test 6: Format Test
        const formatOk = await testKOLAlertFormat();
        if (formatOk) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Test 7: Delete Alert
        if (createdAlertId) {
            const deleted = await testDeleteKOLAlert();
            if (deleted) {
                results.passed++;
            } else {
                results.failed++;
            }
            
            // Test 8: Verify Deletion
            const verified = await testVerifyDeletion();
            if (verified) {
                results.passed++;
            } else {
                results.failed++;
            }
        } else {
            logWarning('Skipping delete tests (no alert created)');
            results.skipped += 2;
        }
        
    } catch (error) {
        logError(`\nUnexpected error: ${error.message}`);
        console.log(error.stack);
    }
    
    // Final summary
    logSection('TEST SUMMARY');
    console.log('');
    logSuccess(`Passed: ${results.passed}`);
    if (results.failed > 0) {
        logError(`Failed: ${results.failed}`);
    } else {
        logInfo(`Failed: ${results.failed}`);
    }
    if (results.skipped > 0) {
        logWarning(`Skipped: ${results.skipped}`);
    }
    
    const total = results.passed + results.failed + results.skipped;
    const percentage = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
    
    console.log('');
    if (results.failed === 0) {
        log(`🎉 ALL TESTS PASSED! (${percentage}%)`, 'green');
        log('✅ KOL Alert system is ready for deployment!', 'green');
    } else {
        log(`⚠️  ${results.failed} test(s) failed (${percentage}% passed)`, 'yellow');
        log('Please fix the issues before deploying', 'yellow');
    }
    
    console.log('\n');
}

// Run tests
runTests().catch(error => {
    logError(`Fatal error: ${error.message}`);
    console.log(error.stack);
    process.exit(1);
});
