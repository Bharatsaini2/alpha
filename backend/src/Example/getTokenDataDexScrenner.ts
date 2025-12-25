import axios from "axios"

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export async function getTokenData(tokenAddress: string, retries = 3) {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`

  try {
    const response = await axios.get(url)

    if (!response.data.pairs || response.data.pairs.length === 0) {
      console.warn(`No data found for token address: ${tokenAddress}`)
      return { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
    }

    const tokenData = response.data.pairs[0]

    console.log("tokenData-------------",tokenData)

    return {
      price: parseFloat(tokenData.priceUsd) || 0,
      volume24h: tokenData.volume?.h24 || 0,
      marketCap: tokenData.marketCap ? parseFloat(tokenData.marketCap) : 0,
      imageUrl: tokenData.info?.imageUrl || null,
    }
  } catch (error: any) {
    console.error(`Error fetching data for ${tokenAddress}: ${error.message}`)

    if (retries > 0) {
      console.warn(`Retrying in 5 seconds... (${retries} retries left)`)
      await delay(5000)
      return getTokenData(tokenAddress, retries - 1)
    }

    return { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
  }
}

// Example usage
async function main() {
  const tokenAddress = "F4H9DL8bJ1YYPMAW2YZbWai43t93t2dncisE9x4Jpump" 
  // const tokenAddress = "GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump" 
  const data = await getTokenData(tokenAddress)
  console.log("Token Data:", data)
}

main()
