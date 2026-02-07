// Validate Solana address format
const bs58 = require('bs58');

const ADDRESS = '5ATM1ywJ5fz24MSZC7WfGL8hfy1xV3yfAjAAugky5WYJ';

console.log('🔍 Validating Solana Address Format\n');
console.log('═'.repeat(60));
console.log(`Address: ${ADDRESS}`);
console.log(`Length: ${ADDRESS.length} characters`);
console.log('═'.repeat(60));

// Check length (Solana addresses are typically 32-44 characters)
if (ADDRESS.length < 32 || ADDRESS.length > 44) {
  console.log(`❌ Invalid length: ${ADDRESS.length} (should be 32-44)`);
} else {
  console.log(`✅ Length OK: ${ADDRESS.length}`);
}

// Try to decode as base58
try {
  const decoded = bs58.decode(ADDRESS);
  console.log(`✅ Base58 decode successful`);
  console.log(`   Decoded length: ${decoded.length} bytes`);
  
  // Solana public keys should be exactly 32 bytes
  if (decoded.length === 32) {
    console.log(`✅ Correct byte length (32 bytes)`);
    console.log(`\n✅ THIS IS A VALID SOLANA ADDRESS!`);
  } else {
    console.log(`❌ Wrong byte length: ${decoded.length} (should be 32)`);
    console.log(`\n❌ NOT A VALID SOLANA ADDRESS`);
  }
} catch (error) {
  console.log(`❌ Base58 decode failed: ${error.message}`);
  console.log(`\n❌ NOT A VALID SOLANA ADDRESS`);
}
