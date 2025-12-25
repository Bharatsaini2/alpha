import { Connection } from '@solana/web3.js'
import dotenv from 'dotenv'
dotenv.config()

const rpcUrl = process.env.RPC_URL

export const solConnection = new Connection(rpcUrl!, {
  commitment: 'confirmed',
})
