const axios = require('axios');
require('dotenv').config();

const BITQUERY_API_KEY = 'ory_at_0Oojwa1xpPVPlvWHhkcj3-oc0UWa0-_xvgcSrdq1dBA.c6pwECwh0BKWaHJ_KxYN0lNiQp0XhMvAEX8CXWsX4CU';
const TOKEN_MINT = 'G2iDE5oPhv8wZ6B3n98Pic6w4tbHa3sBmKcZgKrgcyRp';

const DEXES = [
  { name: 'Raydium', programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', method: 'initialize2' },
  { name: 'Orca', programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', method: 'initializePool' },
  { name: 'Meteora', programId: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', method: 'initializeLbPair2' },
  { name: 'Pump', programId: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', method: 'create_pool' },
];

const API_URL = 'https://streaming.bitquery.io/eap';

// Fetch data for a specific DEX
async function fetchCreatePoolInstructions(dex:any) {
  const query = `
  {
    Solana {
      Instructions(
        where: {Instruction: {Program: {Method: {is: "${dex.method}"}, Address: {is: "${dex.programId}"}}}}
      ) {
        Instruction {
          Program { Address Method }
          Accounts {
            Address
            Token { Mint }
          }
        }
        Block { Time Height }
        Transaction { Signature }
      }
    }
  }`;

  try {
    const response = await axios.post(API_URL, { query }, {
      headers: {
        Authorization: `Bearer ${BITQUERY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(JSON.stringify(response.data));
    const instructions = response.data?.data?.Solana?.Instructions || [];

    // Filter for TOKEN_MINT in any Account
    return instructions.filter((event:any) =>
      event.Instruction.Accounts.some((acc:any) =>
        acc.Token?.Mint === TOKEN_MINT || acc.Address === TOKEN_MINT
      )
    ).map((event:any) => ({
      dex: dex.name,
      time: event.Block.Time,
      block: event.Block.Height,
      signature: event.Transaction.Signature,
    }));
  } catch (err:any) {
    console.error(`❌ Error fetching ${dex.name}:`, err.message);
    return [];
  }
}

// Main function to find the earliest event
async function findLaunchTime() {
  let allEvents:any = [];

  for (const dex of DEXES) {
    console.log(`🔍 Checking ${dex.name}...`);
    const events = await fetchCreatePoolInstructions(dex);
    if (events!.length) {
      console.log(`✅ Found ${events!.length} event(s) for ${TOKEN_MINT} on ${dex.name}`);
      allEvents = allEvents.concat(events);
    }
  }

  if (allEvents.length === 0) {
    console.log(`❌ No create_pool events found for mint: ${TOKEN_MINT}`);
    return;
  }

  // Find the earliest event
  const earliest = allEvents.reduce((min:any, ev:any) =>
    new Date(ev.time) < new Date(min.time) ? ev : min
  );

  console.log(`\n🚀 Earliest create_pool for ${TOKEN_MINT}:`);
  console.log(`DEX: ${earliest.dex}`);
  console.log(`Time: ${earliest.time}`);
  console.log(`Block: ${earliest.block}`);
  console.log(`Tx: ${earliest.signature}`);
}

findLaunchTime();
