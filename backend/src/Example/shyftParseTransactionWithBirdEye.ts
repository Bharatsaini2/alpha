import {
  getTokenData,
  getTokenMetaDataUsingRPC
} from '../config/solana-tokens-config'

const myHeaders = new Headers({
  'x-api-key': '_Lulx-rD8Ibrmvp_',
  'Content-Type': 'application/json',
})

const STATIC_SIGNATURE =
  '2PNUNpCPKtw6YFbZf965jTM7B29jpn23jHRVBzewzKEaPyqz7GVRJMS6goNfUfBv4hcSU9T98GqZyxkwYu7kb9tR'

export const getParsedTransaction = async () => {
  const requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow' as RequestRedirect,
  }

  try {
    const response = await fetch(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${STATIC_SIGNATURE}`,
      requestOptions,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`,
      )
    }

    const result = await response.json() // Use .json() instead of parsing text manually
    return result
  } catch (error: any) {
    console.error('Error fetching parsed transaction:', error.message || error)
    return null
  }
}

// 🛠️ Helper: Get symbol safely
const resolveSymbol = async (token: any) => {
  if (token.symbol !== 'Token') return token.symbol
  try {
    const metadata = await getTokenMetaDataUsingRPC(token.token_address)
    return metadata.symbol || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

// 🔄 Main async function
;(async () => {
  const parsedTx = await getParsedTransaction()
  if (!parsedTx || !parsedTx.result) return

  const txType = parsedTx.result?.type
  const actions = parsedTx.result?.actions
  if (!actions || actions.length < 3) return

  const actionInfo = actions[0]?.info
  if (
    !actionInfo ||
    Object.keys(actionInfo).length === 0 ||
    !actionInfo.tokens_swapped
  )
    return

  if (txType === 'SWAP') {
    const { in: tokenIn, out: tokenOut } = actionInfo.tokens_swapped
    const excludedTokens = ['SOL', 'WSOL', 'USDT', 'USDC']

    const inExcluded = excludedTokens.includes(tokenIn.symbol)
    const outExcluded = excludedTokens.includes(tokenOut.symbol)
    const bothNonExcluded = !inExcluded && !outExcluded

    const isBuy = bothNonExcluded || (!outExcluded && inExcluded)
    const isSell = bothNonExcluded || (outExcluded && !inExcluded)

    if (!isBuy && !isSell) return

    console.log(`Valid swap: ${tokenIn.symbol} -> ${tokenOut.symbol}`)

    const [inSymbol, outSymbol] = await Promise.all([
      resolveSymbol(tokenIn),
      resolveSymbol(tokenOut),
    ])

    let inTokenData: any = {}
    let outTokenData: any = {}

    // 💡 Fetch token data conditionally based on buy/sell status
    if (isSell && !isBuy) {
      inTokenData = await getTokenData(tokenIn.token_address)
      outTokenData = outExcluded
        ? { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
        : await getTokenData(tokenOut.token_address)
    } else if (isBuy && !isSell) {
      outTokenData = await getTokenData(tokenOut.token_address)
      inTokenData = inExcluded
        ? { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
        : await getTokenData(tokenIn.token_address)
    } else {
      // spl -> spl
      ;[outTokenData, inTokenData] = await Promise.all([
        getTokenData(tokenOut.token_address),
        getTokenData(tokenIn.token_address),
      ])
    }

    // 🖨️ Optional debug output
    console.log('Token IN Data:', inTokenData)
    console.log('Token OUT Data:', outTokenData)
    console.log('Token In Symbol:', inSymbol)
    console.log('Token OUT Symbol:', outSymbol)
  }
})().catch((error) => {
  console.error('Unexpected error:', error)
})
