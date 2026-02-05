/**
 * Analyze Previous Test Results to Find Problematic Transactions
 * 
 * This script reads the CSV files from the previous live test to:
 * 1. Find transactions rejected with "invalid_asset_count"
 * 2. Find transactions with potentially doubled amounts
 * 3. Extract signatures for testing the fixes
 */

const fs = require('fs')
const path = require('path')

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim())
    const row = {}
    headers.forEach((header, index) => {
      row[header] = values[index]
    })
    rows.push(row)
  }

  return rows
}

function findLatestCSVFiles() {
  const files = fs.readdirSync('.')
  
  const rejectionFiles = files
    .filter(f => f.startsWith('v2-rejections-') && f.endsWith('.csv'))
    .sort()
    .reverse()

  const detectionFiles = files
    .filter(f => f.startsWith('v2-detections-') && f.endsWith('.csv'))
    .sort()
    .reverse()

  return {
    rejections: rejectionFiles[0] || null,
    detections: detectionFiles[0] || null
  }
}

function analyzeRejections(rejections) {
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('REJECTION ANALYSIS')))
  console.log(colors.cyan('═'.repeat(80)))

  // Group by reason
  const reasonCounts = {}
  rejections.forEach(r => {
    const reason = r.Rejection_Reason || 'unknown'
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  })

  console.log(colors.yellow('\n📊 Rejection Reasons:'))
  Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      const pct = ((count / rejections.length) * 100).toFixed(1)
      console.log(colors.gray(`   ${reason}: ${count} (${pct}%)`))
    })

  // Find invalid_asset_count rejections
  const invalidAssetCount = rejections.filter(r => 
    r.Rejection_Reason === 'invalid_asset_count'
  )

  if (invalidAssetCount.length > 0) {
    console.log(colors.red(`\n🔴 Found ${invalidAssetCount.length} "invalid_asset_count" rejections`))
    console.log(colors.yellow('   These should be FIXED by SOL/WSOL merge'))
    console.log(colors.gray('\n   Sample signatures (first 5):'))
    invalidAssetCount.slice(0, 5).forEach((r, i) => {
      console.log(colors.gray(`   ${i + 1}. ${r.Signature}`))
    })
  } else {
    console.log(colors.green('\n✅ No "invalid_asset_count" rejections found'))
  }

  return invalidAssetCount
}

function analyzeDetections(detections) {
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('DETECTION ANALYSIS')))
  console.log(colors.cyan('═'.repeat(80)))

  console.log(colors.green(`\n✅ Total detections: ${detections.length}`))

  // Analyze amount patterns
  const withAmounts = detections.filter(d => 
    d.Input_Amount && d.Output_Amount && 
    parseFloat(d.Input_Amount) > 0 && parseFloat(d.Output_Amount) > 0
  )

  console.log(colors.blue(`\n📊 Transactions with amounts: ${withAmounts.length}`))

  // Look for potentially doubled amounts (very rough heuristic)
  const suspiciousAmounts = withAmounts.filter(d => {
    const input = parseFloat(d.Input_Amount)
    const output = parseFloat(d.Output_Amount)
    
    // If amounts are suspiciously large or have unusual patterns
    // This is just a heuristic - not definitive
    return input > 1000000 || output > 1000000
  })

  if (suspiciousAmounts.length > 0) {
    console.log(colors.yellow(`\n⚠️  Found ${suspiciousAmounts.length} transactions with large amounts`))
    console.log(colors.gray('   (May indicate doubled amounts - needs manual verification)'))
    console.log(colors.gray('\n   Sample signatures (first 5):'))
    suspiciousAmounts.slice(0, 5).forEach((d, i) => {
      console.log(colors.gray(`   ${i + 1}. ${d.Signature}`))
      console.log(colors.gray(`      ${d.Side}: ${d.Input_Token} (${d.Input_Amount}) → ${d.Output_Token} (${d.Output_Amount})`))
    })
  }

  return suspiciousAmounts
}

function generateTestScript(invalidAssetCount, suspiciousAmounts) {
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('GENERATING TEST SCRIPT')))
  console.log(colors.cyan('═'.repeat(80)))

  const testSignatures = []

  // Add invalid_asset_count signatures
  if (invalidAssetCount.length > 0) {
    testSignatures.push({
      signature: invalidAssetCount[0].Signature,
      description: 'Issue #1: Invalid Asset Count (SOL/WSOL merge)',
      whale: invalidAssetCount[0].Whale_Address
    })
  }

  // Add suspicious amount signature
  if (suspiciousAmounts.length > 0) {
    testSignatures.push({
      signature: suspiciousAmounts[0].Signature,
      description: 'Issue #2: Potentially doubled amounts',
      whale: suspiciousAmounts[0].Whale_Address
    })
  }

  if (testSignatures.length === 0) {
    console.log(colors.yellow('\n⚠️  No problematic transactions found in CSV files'))
    console.log(colors.gray('   This might mean:'))
    console.log(colors.gray('   1. The CSV files are from after the fixes'))
    console.log(colors.gray('   2. The test window was too short'))
    console.log(colors.gray('   3. No problematic transactions occurred'))
    return
  }

  console.log(colors.green(`\n✅ Found ${testSignatures.length} test cases`))
  console.log(colors.gray('\n   Test signatures:'))
  testSignatures.forEach((test, i) => {
    console.log(colors.gray(`   ${i + 1}. ${test.description}`))
    console.log(colors.gray(`      Signature: ${test.signature}`))
    console.log(colors.gray(`      Whale: ${test.whale}\n`))
  })

  // Update test-amount-fixes.js
  const testScriptPath = 'test-amount-fixes.js'
  if (fs.existsSync(testScriptPath)) {
    let testScript = fs.readFileSync(testScriptPath, 'utf-8')
    
    // Replace the test array
    const testArray = `const tests = [\n${testSignatures.map(t => 
      `    {\n      signature: '${t.signature}',\n      description: '${t.description}'\n    }`
    ).join(',\n')}\n  ]`

    testScript = testScript.replace(
      /const tests = \[[\s\S]*?\]/,
      testArray
    )

    fs.writeFileSync(testScriptPath, testScript)
    console.log(colors.green(`\n✅ Updated ${testScriptPath} with real signatures`))
    console.log(colors.cyan('\n   Run the test with:'))
    console.log(colors.gray('   node test-amount-fixes.js'))
  }
}

function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         Analyze Previous Test Results for Problematic Transactions        ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  const csvFiles = findLatestCSVFiles()

  if (!csvFiles.rejections && !csvFiles.detections) {
    console.log(colors.red('❌ No CSV files found!'))
    console.log(colors.yellow('\n   Please run the live test first:'))
    console.log(colors.gray('   node compare-v1-v2-live.js'))
    return
  }

  console.log(colors.blue('📁 Found CSV files:'))
  if (csvFiles.rejections) {
    console.log(colors.gray(`   Rejections: ${csvFiles.rejections}`))
  }
  if (csvFiles.detections) {
    console.log(colors.gray(`   Detections: ${csvFiles.detections}`))
  }

  let invalidAssetCount = []
  let suspiciousAmounts = []

  // Analyze rejections
  if (csvFiles.rejections) {
    const rejections = parseCSV(csvFiles.rejections)
    if (rejections && rejections.length > 0) {
      invalidAssetCount = analyzeRejections(rejections)
    }
  }

  // Analyze detections
  if (csvFiles.detections) {
    const detections = parseCSV(csvFiles.detections)
    if (detections && detections.length > 0) {
      suspiciousAmounts = analyzeDetections(detections)
    }
  }

  // Generate test script
  generateTestScript(invalidAssetCount, suspiciousAmounts)

  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('NEXT STEPS')))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.yellow('\n1. Review the signatures above'))
  console.log(colors.yellow('2. Run: node test-amount-fixes.js'))
  console.log(colors.yellow('3. Verify fixes work correctly'))
  console.log(colors.yellow('4. Run full 5-minute test: node compare-v1-v2-live.js'))
  console.log(colors.yellow('5. Compare before/after results\n'))
}

main()
