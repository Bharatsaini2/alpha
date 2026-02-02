/**
 * Convert CSV files to Excel format
 * 
 * This script converts the generated CSV files to Excel format for easier analysis
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function csvToExcel() {
  console.log('📊 Converting CSV files to Excel format...\n');
  
  const csvFiles = [
    'v1-transactions.csv',
    'v2-detections.csv',
    'v2-rejections.csv',
    'matches.csv',
    'v1-only-v2-missed.csv',
    'v2-only-sample-100.csv'
  ];
  
  // Create a new workbook
  const workbook = XLSX.utils.book_new();
  
  csvFiles.forEach(csvFile => {
    if (fs.existsSync(csvFile)) {
      console.log(`📄 Processing ${csvFile}...`);
      
      // Read CSV file
      const csvData = fs.readFileSync(csvFile, 'utf8');
      
      // Convert CSV to worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(
        csvData.split('\n').map(row => row.split(','))
      );
      
      // Add worksheet to workbook with a clean sheet name
      const sheetName = csvFile.replace('.csv', '').replace(/-/g, '_');
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      console.log(`✅ Added sheet: ${sheetName}`);
    } else {
      console.log(`⚠️  File not found: ${csvFile}`);
    }
  });
  
  // Write Excel file
  const excelFile = 'v1-v2-comparison-analysis.xlsx';
  XLSX.writeFile(workbook, excelFile);
  
  console.log(`\n🎉 Excel file created: ${excelFile}`);
  console.log('\nSheets included:');
  console.log('  • v1_transactions - All V1 transactions from database');
  console.log('  • v2_detections - All V2 parser detections');
  console.log('  • v2_rejections - All V2 parser rejections with reasons');
  console.log('  • matches - Transactions found by both parsers');
  console.log('  • v1_only_v2_missed - Transactions V2 missed');
  console.log('  • v2_only_sample_100 - Sample of V2 extras (first 100)');
}

// Check if xlsx module is available
try {
  require.resolve('xlsx');
  csvToExcel();
} catch (e) {
  console.log('❌ xlsx module not found. Installing...');
  console.log('Run: npm install xlsx');
  console.log('Then run this script again.');
}