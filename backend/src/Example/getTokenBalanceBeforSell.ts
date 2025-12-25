import {
  AddressLookupTableAccount,
  Connection,
  MessageV0,
  PublicKey,
} from '@solana/web3.js'
import { connectDB } from '../config/connectDb'
import whaleAllTransactionModel from '../models/whale-all-transactions.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'

// STEP 1: Setup connection
const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=214f77d6-79d8-4079-aa78-ad5107942ca5`
const solConnection = new Connection(rpcUrl, {
  commitment: 'confirmed',
})

// STEP 2: Get token balance before sell
async function getTokenBalanceBeforeSell(
  whaleAddress: string,
  tokenMint: string,
  sellTxSignature: string,
) {
  console.log("whaleAddress------",whaleAddress)
  console.log("sellTxSignature----------",sellTxSignature)
  console.log("tokenMint---------",tokenMint)
  // 1. Get the slot of the sell transaction
  const tx = await solConnection.getTransaction(sellTxSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })

  // console.log("tx================",tx)
  console.log("tx.meta?.preTokenBalances================",tx?.meta?.preTokenBalances)

  if (!tx || !tx.slot) throw new Error('Transaction or slot not found.')
  // Search the account matching the whale's token account
  const tokenBalanceInfo = tx.meta?.preTokenBalances?.find(
    (balance) => balance.owner === whaleAddress && balance.mint === tokenMint,
  )

  console.log('tokenBalanceInfo===========', tokenBalanceInfo)

  if (!tokenBalanceInfo)
    throw new Error('Token balance info before transaction not found.')

  // return parseFloat(tokenBalanceInfo.uiTokenAmount.amount);
  return {
    amountBefore: tokenBalanceInfo.uiTokenAmount.uiAmount,
  }
}

// async function getTokenBalanceBeforeSell(
//   whaleAddress: string,
//   tokenMint: string,
//   sellTxSignature: string,
// ) {
//   const tx = await solConnection.getTransaction(sellTxSignature, {
//     commitment: 'confirmed',
//     maxSupportedTransactionVersion: 0,
//   })

//   if (!tx) throw new Error('Transaction not found')


//   const tokenPreBalances = tx.meta?.preTokenBalances || []
//   console.log("tokenPreBalances----------",tokenPreBalances)
//   const tokenPostBalances = tx.meta?.postTokenBalances || []
//   console.log("tokenPostBalances----------",tokenPostBalances)

//   let maxAmount = 0;
//   let matchingEntry = null;

//   for (const balance of tokenPreBalances) {
//     if (balance.mint === tokenMint) {
//       const amount = balance.uiTokenAmount.uiAmount ?? 0;

//       if (amount > maxAmount) {
//         maxAmount = amount;
//         matchingEntry = balance;
//       }
//     }
//   }

//   console.log("maxAmount------------",maxAmount)

//   if (!matchingEntry) {
//     throw new Error(`No preTokenBalance entry found for mint: ${tokenMint}`);
//   }

//   return {
//     amountBefore: maxAmount,
//   };

// }

// find whale exit P&L info
const getRealizedPnLAndEntryDetails = async (
  whaleAddress: string,
  tokenAddress: string,
  tokenPrice: number,
  sellAmount: number,
) => {
  const buys = await whaleAllTransactionModelV2
    .find({
      whaleAddress,
      tokenOutAddress: tokenAddress,
      $or: [
        { type: 'buy' },
        {
          type: 'both',
          bothType: { $elemMatch: { buyType: true } },
        },
      ],
    })
    .sort({ timestamp: 1 })
    .lean()

  console.log('buy length============', buys.length)

  const totalTokensBought = buys.reduce(
    (sum, tx) =>
      sum + parseFloat((tx.tokenAmount as any)?.buyTokenAmount || '0'),
    0,
  )

  console.log('totalTokensBought-----------', totalTokensBought)
  const totalCost = buys.reduce(
    (sum, tx) => sum + parseFloat((tx.amount as any)?.buyAmount || '0'),
    0,
  )

  console.log('totalCost=========', totalCost)

  const avgEntryPrice =
    totalTokensBought > 0 ? totalCost / totalTokensBought : 0

  console.log('avgEntryPrice===========', avgEntryPrice)
  const sells = await whaleAllTransactionModelV2
    .find({
      whaleAddress,
      tokenInAddress: tokenAddress,
      $or: [
        { type: 'sell' },
        {
          type: 'both',
          bothType: { $elemMatch: { sellType: true } },
        },
      ],
    })
    .lean()

  console.log('sells---------------', sells.length)
  const totalTokensSold = sells.reduce(
    (sum, tx) =>
      sum + parseFloat((tx.tokenAmount as any)?.sellTokenAmount || '0'),
    0,
  )

  console.log('totalTokensSold--------------', totalTokensSold)
  const realizedPnL = (tokenPrice - avgEntryPrice) * sellAmount
  console.log("realizedPnL--------------",realizedPnL)
  const remainingBalance = totalTokensBought - totalTokensSold
  console.log("remainingBalance----------",remainingBalance)
  const unrealizedPnL = (tokenPrice - avgEntryPrice) * remainingBalance

  const earliestTx = buys[0]
  const entryMarketCap = (earliestTx.marketCap as any)?.buyMarketCap || '0'
  const entryTimestamp = earliestTx?.timestamp || new Date()

  const holdingDuration =
    (Date.now() - new Date(entryTimestamp).getTime()) / (1000 * 60 * 60 * 24)

  return {
    realizedPnL,
    unrealizedPnL,
    remainingValue: remainingBalance * tokenPrice,
    entryMarketCap,
    holdingDuration: parseFloat(holdingDuration.toFixed(1)),
  }
}

// 👇 Exported main function
export const processWhaleExit = async () => {
  await connectDB() // 👈 Ensure DB is connected

  const whaleAddress = '5BCSYeyxKFfqm8q3eEKwbAvPtfsNhYPANdfKPXHj5tUW'
  const tokenMint = '5c74v6Px9RKwdGWCfqLGfEk7UZfE3Y4qJbuYrLbVG63V'
  const sellTxSignature =
    'Zhg6iCkQ557poxwzAhabDxGxL9ixeN2DVXm8ZE5AepHpPoGbnZvvyUoHSMKQctPVjUWmW8kRgPXDeWPoUQBV7qu'
  const tokenAmount = 2009499.814476
  const txValue = 7569.785801131092
  const tokenPrice = 0.003767
  if (txValue >= 5000) {
    const previousHoldings = await getTokenBalanceBeforeSell(
      whaleAddress,
      tokenMint,
      sellTxSignature,
    )
    console.log('Actual token balance before sell:', previousHoldings.amountBefore)

    if (!previousHoldings.amountBefore || previousHoldings.amountBefore === 0) {
      console.log('Token balance before sell is zero. Cannot compute sell %.')
      return
    }
    const sellPercentage = (tokenAmount / previousHoldings.amountBefore!) * 100
    if (sellPercentage > 100) {
      console.warn(`⚠️ Sell percentage is over 100%. This may indicate a token account mismatch or incorrect token decimals.`);
      return;
    }
    console.log('sellPercentage------------', sellPercentage)
    const isExitSell = sellPercentage >= 50 && txValue >= 5000

    if (!isExitSell) return console.log('Not an exit sell.')

    const pnlData = await getRealizedPnLAndEntryDetails(
      whaleAddress,
      tokenMint,
      tokenPrice,
      tokenAmount,
    )

    console.log('pnlData details-------------', pnlData)

    // await whaleExitAlertModel.create({
    //   signature: sellTxSignature,
    //   whaleSymbol: 'MICHI',
    //   tokenSymbol: 'POPCAT',
    //   whaleAddress: whaleAddress,
    //   tokenAddress: tokenMint,
    //   sellPercent: sellPercentage,
    //   realizedPnL: pnlData.realizedPnL,
    //   unrealizedPnL: pnlData.unrealizedPnL,
    //   remainingValue: pnlData.remainingValue,
    //   entryMarketCap: pnlData.entryMarketCap,
    //   currentMarketCap: 374688150,
    //   holdingDuration: pnlData.holdingDuration,
    //   tweeted: false,
    // })

    // console.log('🔥 Whale Exit Detected!')

    // await postWhaleExitAlert({
    //   whaleSymbol: 'MICHI',
    //   tokenSymbol: 'POPCAT',
    //   sellPercent: sellPercentage,
    //   realizedPnL: pnlData.realizedPnL,
    //   remainingValue: pnlData.remainingValue,
    //   unrealizedPnL: pnlData.unrealizedPnL,
    //   entryMarketCap: pnlData.entryMarketCap,
    //   currentMarketCap: 374688150,
    //   holdingDuration: pnlData.holdingDuration,
    // })
    // console.log('Updating tweetPosted for whale: MICHI')
  }
}

processWhaleExit()
