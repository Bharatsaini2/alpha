const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Solana connection
// const connection = new Connection('https://api.mainnet-beta.solana.com');
const connection = new Connection('https://blissful-frosty-river.solana-mainnet.quiknode.pro/ecdf0213e711220f9f1468de33e600cd6a1504d1/');

async function parseSwapTransaction(txSignature:string) {
  try {
    // Get the transaction details
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    if (!tx) throw new Error('Transaction not found');
  console.dir(tx, { depth: null, colors: true });

  return;


    const result = {
      txSignature,
      swaps: [] as any,
      tokenTransfers: [] as any,
      dexUsed: new Set() as any,
      totalInput: { amount: 0, token: null },
      totalOutput: { amount: 0, token: null },
      fees: tx.meta?.fee ? tx.meta.fee / 10**9 : 0 // Convert lamports to SOL
    };

    // Extract token balances before and after
    const tokenBalances = {
      pre: tx.meta?.preTokenBalances || [],
      post: tx.meta?.postTokenBalances || []
    };

    // Parse log messages for swap events
    const logMessages = tx.meta?.logMessages || [];
    logMessages.forEach((log:any) => {
      // Detect swap events
      if (log.includes('SwapEvent') || log.includes('Swap') || log.includes('SwapBaseInput') || log.includes('SwapV2')) {
        const dexMatch = log.match(/dex: (\w+)/);
        const inMatch = log.match(/amount_in: (\d+)/);
        const outMatch = log.match(/amount_out: (\d+)/);

        if (dexMatch && inMatch && outMatch) {
          const dex = dexMatch[1];
          result.dexUsed.add(dex);

          // Try to find token addresses from surrounding logs
          const tokenInLog = logMessages[logMessages.indexOf(log) - 1];
          const tokenOutLog = logMessages[logMessages.indexOf(log) + 1];

          let tokenIn, tokenOut;

          // Try to extract from token transfer logs
          if (tokenInLog && tokenInLog.includes('before_source_balance')) {
            const mintMatch = tokenInLog.match(/mint": "([^"]+)"/);
            if (mintMatch) tokenIn = mintMatch[1];
          }

          if (tokenOutLog && tokenOutLog.includes('after_destination_balance')) {
            const mintMatch = tokenOutLog.match(/mint": "([^"]+)"/);
            if (mintMatch) tokenOut = mintMatch[1];
          }

          // Fallback to token balance changes
          if (!tokenIn || !tokenOut) {
            const amountIn = parseInt(inMatch[1]);
            const amountOut = parseInt(outMatch[1]);

            // Find token with matching amount change
            for (let i = 0; i < tokenBalances.pre.length; i++) {
              const pre = tokenBalances.pre[i];
              const post = tokenBalances.post.find((p:any) => 
                p.accountIndex === pre.accountIndex && 
                p.mint === pre.mint
              );

              if (post) {
                const change = parseInt(post.uiTokenAmount.amount) - parseInt(pre.uiTokenAmount.amount);
                if (Math.abs(change) === amountIn) {
                  tokenIn = pre.mint;
                }
                if (Math.abs(change) === amountOut) {
                  tokenOut = pre.mint;
                }
              }
            }
          }

          // Get decimals
          const getDecimals = (mint:string) => {
            const token = [...tokenBalances.pre, ...tokenBalances.post].find(t => t.mint === mint);
            return token ? token.uiTokenAmount.decimals : null;
          };

          const swap:any = {
            dex,
            tokenIn: {
              mint: tokenIn,
              amount: parseInt(inMatch[1]),
              decimals: getDecimals(tokenIn),
              uiAmount: parseInt(inMatch[1]) / 10**(getDecimals(tokenIn) || 0)
            },
            tokenOut: {
              mint: tokenOut,
              amount: parseInt(outMatch[1]),
              decimals: getDecimals(tokenOut),
              uiAmount: parseInt(outMatch[1]) / 10**(getDecimals(tokenOut) || 0)
            },
            timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null
          };

          result.swaps.push(swap);
        }
      }

      // Detect token transfers (including commissions)
      if (log.includes('Transfer') && log.includes('amount')) {
        const amountMatch = log.match(/amount: (\d+)/);
        const authorityMatch = log.match(/authority: ([^\s,]+)/);
        const sourceMatch = log.match(/source: ([^\s,]+)/);
        const destinationMatch = log.match(/destination: ([^\s,]+)/);

        if (amountMatch) {
          const transfer:any = {
            amount: parseInt(amountMatch[1]),
            authority: authorityMatch?.[1],
            source: sourceMatch?.[1],
            destination: destinationMatch?.[1],
            isCommission: log.includes('commission')
          };

          // Try to identify token
          if (sourceMatch) {
            const sourceToken:any = tokenBalances.pre.find((t:any) => 
              t.owner === tx.transaction.message.accountKeys[0].pubkey.toString() && 
              t.accountIndex === tx.transaction.message.accountKeys.findIndex(
                (a:any) => a.pubkey.toString() === sourceMatch[1]
              )
            );
            if (sourceToken) {
              transfer.mint = sourceToken.mint;
              transfer.decimals = sourceToken.uiTokenAmount.decimals;
              transfer.uiAmount = transfer.amount / 10**transfer.decimals;
            }
          }

          result.tokenTransfers.push(transfer);
        }
      }
    });

    // Calculate totals
    if (result.swaps.length > 0) {
      result.totalInput = {
        amount: result.swaps[0].tokenIn.uiAmount,
        token: result.swaps[0].tokenIn.mint
      };
      result.totalOutput = {
        amount: result.swaps[result.swaps.length - 1].tokenOut.uiAmount,
        token: result.swaps[result.swaps.length - 1].tokenOut.mint
      };
    }

    // Convert dexUsed Set to array
    result.dexUsed = Array.from(result.dexUsed);

    return result;

  } catch (error:any) {
    console.error('Error parsing transaction:', error);
    return { error: error.message };
  }
}

// Example usage
async function main() {
  const txSignature = '5fEKZdHferp6e5saZYhtjD3iSiWeeMpNmCc4DCutjxGf7Aw2nYETWy8uFgCTbq757p3QVz9DYCHVrP9xc3TFjFFw';
  const swapDetails = await parseSwapTransaction(txSignature);
  console.log(JSON.stringify(swapDetails, null, 2));
}

main().catch(console.error);