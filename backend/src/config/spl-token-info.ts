import { PublicKey } from '@solana/web3.js'
import { Metaplex } from '@metaplex-foundation/js'
import { solConnection } from './solana-config'

export const getTokenInfo = async (address: string) => {
  const metaplex = await Metaplex.make(solConnection)
  const mintAddress = new PublicKey(address)
  try {
    const metadataAccount = metaplex
      .nfts()
      .pdas()
      .metadata({ mint: mintAddress })
    const metadataAccountInfo =
      await solConnection.getAccountInfo(metadataAccount)
    if (metadataAccountInfo) {
      const token = await metaplex.nfts().findByMint({ mintAddress })
      const decimals = token.mint.supply.currency.decimals
      // const supply = token.mint?.supply.basisPoints / Math.pow(10, decimals)
      return {
        // tokenName: token.name,
        // tokenSymbol: token.symbol,
        // tokenSupply: supply,
        tokenDecimal: decimals,
      }
    }
  } catch (err: any) {
    console.error('Error fetching token information:', err)
  }
}
