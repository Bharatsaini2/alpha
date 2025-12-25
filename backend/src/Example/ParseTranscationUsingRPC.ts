import {
  Connection,
  PublicKey,
  clusterApiUrl,
  ParsedInstruction,
  AddressLookupTableAccount,
  VersionedTransaction,
} from '@solana/web3.js';

type SwapEvent = {
  dex: string;
  amount_in: number;
  amount_out: number;
  token_in_account: string | null;
  token_out_account: string | null;
  token_in_mint: string | null;
  token_out_mint: string | null;
};

const DEX_LABELS: Record<string, string> = {
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'RaydiumSwap',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'MeteoraDlmmSwap2',
  'whirLb9Y77zk8ZcAVrNUVMEYyLZyEvMheHNRgfWoMK9': 'WhirlpoolV2',
  // Add more DEX program IDs here
};

// 🔍 Helper to decode account addresses from instruction indices
function decodeInstructionAccounts(
  instruction: { accounts: number[] },
  accountKeys: (PublicKey | string)[]
): string[] {
  return instruction.accounts.map((accountIndex) => {
    const pubkey = accountKeys[accountIndex];
    return pubkey instanceof PublicKey ? pubkey.toBase58() : pubkey.toString();
  });
}

// 🔍 Helper to get program ID from instruction
function getProgramId(
  instruction: { programIdIndex: number },
  accountKeys: (PublicKey | string)[]
): string {
  const pubkey = accountKeys[instruction.programIdIndex];
  return pubkey instanceof PublicKey ? pubkey.toBase58() : pubkey.toString();
}

async function fetchSwapEvents(
  connection: Connection,
  txSig: string
): Promise<SwapEvent[]> {
  const tx = await connection.getTransaction(txSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx || !tx.meta || !tx.meta.logMessages) {
    console.error('Invalid transaction or missing metadata');
    return [];
  }

  const logMessages = tx.meta.logMessages;
  const postTokenBalances = tx.meta.postTokenBalances || [];
  // const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;

  const lookupTableAccounts: AddressLookupTableAccount[] = [];

  // Fetch each address lookup table used
  const lookups = tx.transaction.message.addressTableLookups;
  for (const lookup of lookups) {
    const tableAccount = await connection.getAddressLookupTable(lookup.accountKey);
    if (tableAccount.value) {
      lookupTableAccounts.push(tableAccount.value);
    }
  }

  // Reconstruct full VersionedTransaction
  const versionedTx = VersionedTransaction.deserialize(tx.transaction.message.serialize());
  const accountKeys = versionedTx.message.getAccountKeys({ addressLookupTableAccounts: lookupTableAccounts }).staticAccountKeys;

  console.log("accountKeys--------------",accountKeys)

  const swapEvents: SwapEvent[] = [];

  // Regex pattern to capture SwapEvent logs
  const logSwapEventRegex = /SwapEvent\s*{\s*dex:\s*(\w+),\s*amount_in:\s*(\d+),\s*amount_out:\s*(\d+)\s*}/;

  // 🔍 Decode account addresses from inner instructions
  tx.meta.innerInstructions?.forEach((inner, idx) => {
    console.log(`\n=== Inner Instruction Group ${idx + 1} ===`);
    inner.instructions.forEach((ix, j) => {
      const programId = getProgramId(ix, accountKeys);
      const accountAddrs = decodeInstructionAccounts(ix, accountKeys);
      console.log(`Instruction ${j + 1}:`);
      console.log(`  Program ID: ${programId}`);
      console.log(`  Accounts:`);
      accountAddrs.forEach((addr, i) => console.log(`    [${i}]: ${addr}`));
    });
  });

  // 🔍 Extract SwapEvents from logs
  for (let i = 0; i < logMessages.length; i++) {
    const line = logMessages[i];

    const match = line.match(logSwapEventRegex);
    if (match) {
      const [, dex, amountInStr, amountOutStr] = match;
      const amount_in = Number(amountInStr);
      const amount_out = Number(amountOutStr);

      // Attempt to guess token accounts and mints
      let token_in_mint: string | null = null;
      let token_out_mint: string | null = null;
      let token_in_account: string | null = null;
      let token_out_account: string | null = null;

      const tokenChanges = postTokenBalances.filter((b) => {
        const ui = b.uiTokenAmount;
        return (
          typeof ui.uiAmount === 'number' &&
          ui.uiAmount > 0 &&
          ui.amount !== '0'
        );
      });

      if (tokenChanges.length >= 2) {
        token_in_mint = tokenChanges[0]?.mint || null;
        token_out_mint = tokenChanges[1]?.mint || null;
        token_in_account = tokenChanges[0]?.owner || null;
        token_out_account = tokenChanges[1]?.owner || null;
      }

      const dexLabel = DEX_LABELS[dex] || dex;

      swapEvents.push({
        dex: dexLabel,
        amount_in,
        amount_out,
        token_in_account,
        token_out_account,
        token_in_mint,
        token_out_mint,
      });
    }
  }

  return swapEvents;
}

// Example usage
(async () => {
  const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
  const txSig = '5n7rmEBzom1C31XGVKQdvHkUnU9kd8DhBiTrKXRz78HjDySHoEfnNHggjek9hx2Lb1u8wtSgSN7ey87KBpcGNqGC';

  try {
    const swapEvents = await fetchSwapEvents(connection, txSig);
    console.log('\n=== Swap Events ===');
    console.log(JSON.stringify(swapEvents, null, 2));
  } catch (err) {
    console.error('Error parsing transaction:', err);
  }
})();
