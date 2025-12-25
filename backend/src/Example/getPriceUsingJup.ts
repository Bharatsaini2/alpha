import axios from "axios"
const TOKEN_ADDRESS = 'F4H9DL8bJ1YYPMAW2YZbWai43t93t2dncisE9x4Jpump';  

async function getTokenPrice  (tokenAddress: string) {
    try {
      const response = await axios.get(
        `https://lite-api.jup.ag/price/v3?ids=${tokenAddress}`,
        {
          timeout: 20000,
        },
      )
  
      const price = response.data?.[tokenAddress]?.usdPrice
      console.log("price=========",price)
      return price ?? 0
    } catch (err) {
      console.error(
        `Error fetching price for ${tokenAddress} : ${JSON.stringify(err)}`,
      )
      return 0
    }
  }

  (async () => {
    const info = await getTokenPrice(TOKEN_ADDRESS);
    console.log('🔍 Token Overview:',info);
  })();