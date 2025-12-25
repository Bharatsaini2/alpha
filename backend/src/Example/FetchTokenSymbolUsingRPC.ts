import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";

async function getTokenMetadata(mintAddress:string) {
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const metaplex = Metaplex.make(connection);
  const mint = new PublicKey(mintAddress);

  try {
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    // console.log("metadata-----------",metadata)
    console.log(`Token Name: ${metadata.name}`);
    console.log(`Token Symbol: ${metadata.symbol}`);
    console.log(`Token URI: ${metadata.uri}`);
  } catch (error) {
    console.error("Error fetching token metadata:", error);
  }
}

// Example usage:
const tokenMintAddress = "DyUKckoakaTfSWSqixECmjutLrkSL5hVe67MfREipump";
getTokenMetadata(tokenMintAddress);