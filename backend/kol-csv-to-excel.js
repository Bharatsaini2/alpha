/**
 * Convert KOL CSV files to Excel format
 * 
 * This script converts the generated KOL CSV files to Excel format for easier analysis
 */

const XLSX = require('xlsx');
const fs = require('fs');

function kolCsvToExcel() {
  console.log('📊 Converting KOL CSV files to Excel format...\n');
  
  const csvFiles = [
    'v1-kol-transactions.csv',
    'v2-kol-detections.csv', 
    'kol-matches.csv',
    'v1-kol-only-v2-missed.csv',
    'v2-kol-only-sample-100.csv'
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
  const excelFile = 'v1-v2-kol-comparison-analysis.xlsx';
  XLSX.writeFile(workbook, excelFile);
  
  console.log(`\n🎉 KOL Excel file created: ${excelFile}`);
  console.log('\nKOL Sheets included:');
  console.log('  • v1_kol_transactions - All V1 KOL transactions from database');
  console.log('  • v2_kol_detections - All V2 parser KOL detections');
  console.log('  • kol_matches - KOL transactions found by both parsers');
  console.log('  • v1_kol_only_v2_missed - KOL transactions V2 missed');
  console.log('  • v2_kol_only_sample_100 - Sample of V2 KOL extras (first 100)');
}

// Check if xlsx module is available
try {
  require.resolve('xlsx');
  kolCsvToExcel();
} catch (e) {
  console.log('❌ xlsx module not found. Installing...');
  console.log('Run: npm install xlsx');
  console.log('Then run this script again.');
}