import { connectDB } from '../config/connectDb'
import { isDormantWhale } from '../utils/insight-utilities'
import { dormantWhaleAlert } from '../services/insight-posts'

async function testDormantWhaleFeature() {
    await connectDB();
  const whaleAddress = '66H79qPnmq7q4NsRN6GgGoArxJqvM86CWDz2LufowB7X'
  const status = await isDormantWhale(whaleAddress)

  console.log('🐋 Dormant Whale Status:', status)
  const whaleTokenSymbol= 'TRUMP';
      const tokenOutSymbol = 'RFC';
      const formattedValue = 10.08;
      const formattedMarketCap = 50.02;

  if (status?.isDormant) {
    const shortAddress = `${whaleAddress.slice(0, 6)}…${whaleAddress.slice(-4)}`
    const alertMessage = `💤 Dormant Whale Wake-Up\n` +
      `Wallet ${shortAddress} ($${whaleTokenSymbol} Whale) just became active after ${status.daysSinceLastTx} days of silence\n` +
      `Bought $${formattedValue} of $${tokenOutSymbol} at $${formattedMarketCap} MC 🐋`

        console.log("alertMessage==========",alertMessage)
    // await dormantWhaleAlert(alertMessage, {
    //   whaleAddress,
    //   whaleTokenSymbol: whaleTokenSymbol,
    //   tokenOutSymbol: tokenOutSymbol,
    //   amount: formattedValue,
    //   marketCap: formattedMarketCap,
    //   daysSinceLastTx: status.daysSinceLastTx!,
    // })
  }

}

testDormantWhaleFeature()
