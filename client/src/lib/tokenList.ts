// Comprehensive Solana token list for Jupiter swaps
// This list includes popular tokens from the Solana ecosystem

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  image?: string
  isPopular?: boolean
  tags?: string[]
  // Extended fields from Jupiter Ultra API
  usdPrice?: number
  mcap?: number
  fdv?: number
  liquidity?: number
  isVerified?: boolean
  organicScore?: number
  organicScoreLabel?: 'high' | 'medium' | 'low'
}

// Popular tokens that should appear at the top
export const POPULAR_TOKENS: TokenInfo[] = [
  {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    isPopular: true,
    tags: ["native", "popular"],
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    isPopular: true,
    tags: ["stablecoin", "popular"],
  },
  {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
    isPopular: true,
    tags: ["stablecoin", "popular"],
  },
  {
    address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    symbol: "mSOL",
    name: "Marinade staked SOL",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
    isPopular: true,
    tags: ["liquid-staking", "popular"],
  },
  {
    address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    symbol: "ETH",
    name: "Ethereum (Portal)",
    decimals: 8,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
    isPopular: true,
    tags: ["wrapped", "popular"],
  },
  {
    address: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    symbol: "BTC",
    name: "Bitcoin (Portal)",
    decimals: 8,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E/logo.png",
    isPopular: true,
    tags: ["wrapped", "popular"],
  },
]

// Extended token list with more Solana ecosystem tokens
export const EXTENDED_TOKEN_LIST: TokenInfo[] = [
  ...POPULAR_TOKENS,
  // DeFi Tokens
  {
    address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    image: "https://static.jup.ag/jup/icon.png",
    tags: ["defi", "dex"],
  },
  {
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    image: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
    tags: ["meme"],
  },
  {
    address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    symbol: "POPCAT",
    name: "Popcat",
    decimals: 9,
    image: "https://bafkreidlxu5v6gfxqnhqel4eta4exxwqd7n2kqhqq5qxvlzqvqxqxqxqxq.ipfs.nftstorage.link",
    tags: ["meme"],
  },
  {
    address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    symbol: "PYTH",
    name: "Pyth Network",
    decimals: 6,
    image: "https://pyth.network/token.svg",
    tags: ["oracle", "defi"],
  },
  {
    address: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
    symbol: "JTO",
    name: "Jito",
    decimals: 9,
    image: "https://metadata.jito.network/token/jto/image",
    tags: ["liquid-staking", "defi"],
  },
  {
    address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    symbol: "jitoSOL",
    name: "Jito Staked SOL",
    decimals: 9,
    image: "https://metadata.jito.network/token/jitosol/image",
    tags: ["liquid-staking"],
  },
  {
    address: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    symbol: "bSOL",
    name: "BlazeStake Staked SOL",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1/logo.png",
    tags: ["liquid-staking"],
  },
  {
    address: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    symbol: "HNT",
    name: "Helium",
    decimals: 8,
    image: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hnt.png",
    tags: ["iot"],
  },
  {
    address: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
    symbol: "MOBILE",
    name: "Helium Mobile",
    decimals: 6,
    image: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/mobile.png",
    tags: ["iot"],
  },
  {
    address: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
    symbol: "IOT",
    name: "Helium IOT",
    decimals: 6,
    image: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/iot.png",
    tags: ["iot"],
  },
  {
    address: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
    symbol: "MEW",
    name: "cat in a dogs world",
    decimals: 5,
    image: "https://bafkreidlai3kc4c5jh3gzwqfqhp5jxqvqzqzqzqzqzqzqzqzqzqzqzqzqzq.ipfs.nftstorage.link",
    tags: ["meme"],
  },
  {
    address: "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",
    symbol: "WEN",
    name: "Wen",
    decimals: 5,
    image: "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/wen.png",
    tags: ["meme"],
  },
  {
    address: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
    symbol: "INF",
    name: "Infinity",
    decimals: 9,
    image: "https://arweave.net/1S1vXdGVXqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
    tags: ["defi"],
  },
  {
    address: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6",
    symbol: "TNSR",
    name: "Tensor",
    decimals: 9,
    image: "https://www.tensor.trade/favicon.ico",
    tags: ["nft", "marketplace"],
  },
  {
    address: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7",
    symbol: "NOS",
    name: "Nosana",
    decimals: 6,
    image: "https://nosana.io/img/NOS_logo.svg",
    tags: ["compute"],
  },
  {
    address: "RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a",
    symbol: "RLB",
    name: "Rollbit Coin",
    decimals: 2,
    image: "https://rollbit.com/static/favicon-32x32.png",
    tags: ["gaming"],
  },
  {
    address: "SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y",
    symbol: "SHDW",
    name: "Shadow",
    decimals: 9,
    image: "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/shdw.png",
    tags: ["storage"],
  },
  {
    address: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    symbol: "ORCA",
    name: "Orca",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
    tags: ["defi", "dex"],
  },
  {
    address: "MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",
    symbol: "MNDE",
    name: "Marinade",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey/logo.png",
    tags: ["defi", "liquid-staking"],
  },
  {
    address: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
    symbol: "SRM",
    name: "Serum",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt/logo.png",
    tags: ["defi", "dex"],
  },
  {
    address: "RaydiumV3PoolTokens11111111111111111111111",
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
    tags: ["defi", "dex"],
  },
  {
    address: "kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6",
    symbol: "KIN",
    name: "Kin",
    decimals: 5,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6/logo.png",
    tags: ["social"],
  },
  {
    address: "SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp",
    symbol: "SLND",
    name: "Solend",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp/logo.png",
    tags: ["defi", "lending"],
  },
  {
    address: "METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m",
    symbol: "META",
    name: "Metaplex",
    decimals: 6,
    image: "https://arweave.net/KVJrx4h8xJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJq",
    tags: ["nft"],
  },
  {
    address: "FTT9VKZqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
    symbol: "FIDA",
    name: "Bonfida",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp/logo.png",
    tags: ["defi", "domains"],
  },
  {
    address: "CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT",
    symbol: "CASH",
    name: "Cashio",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT/logo.png",
    tags: ["stablecoin"],
  },
  {
    address: "UXD8m9cvwk4RcSxnX2HZ9VudQCEeDH6fRnB4CAP57Dr",
    symbol: "UXD",
    name: "UXD Stablecoin",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/UXD8m9cvwk4RcSxnX2HZ9VudQCEeDH6fRnB4CAP57Dr/logo.png",
    tags: ["stablecoin"],
  },
  {
    address: "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj",
    symbol: "stSOL",
    name: "Lido Staked SOL",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png",
    tags: ["liquid-staking"],
  },
  {
    address: "scnSOL9YDpvMxqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
    symbol: "scnSOL",
    name: "Socean Staked SOL",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm/logo.png",
    tags: ["liquid-staking"],
  },
  {
    address: "DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ",
    symbol: "DUST",
    name: "DUST Protocol",
    decimals: 9,
    image: "https://arweave.net/dust.png",
    tags: ["nft", "gaming"],
  },
  {
    address: "ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx",
    symbol: "ATLAS",
    name: "Star Atlas",
    decimals: 8,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx/logo.png",
    tags: ["gaming", "metaverse"],
  },
  {
    address: "poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk",
    symbol: "POLIS",
    name: "Star Atlas DAO",
    decimals: 8,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk/logo.png",
    tags: ["gaming", "metaverse"],
  },
  {
    address: "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz",
    symbol: "GENE",
    name: "Genopets",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz/logo.png",
    tags: ["gaming", "nft"],
  },
  {
    address: "SLRSSpSLUTP7okbCUBYStWCo1vUgyt775faPqz8HUMr",
    symbol: "SLRS",
    name: "Solrise Finance",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SLRSSpSLUTP7okbCUBYStWCo1vUgyt775faPqz8HUMr/logo.png",
    tags: ["defi"],
  },
  {
    address: "MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K",
    symbol: "MER",
    name: "Mercurial",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K/logo.png",
    tags: ["defi"],
  },
  {
    address: "SAMUELJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
    symbol: "SAMO",
    name: "Samoyedcoin",
    decimals: 9,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/logo.png",
    tags: ["meme"],
  },
  {
    address: "CRYPTOJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
    symbol: "COPE",
    name: "Cope",
    decimals: 6,
    image: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh/logo.png",
    tags: ["social"],
  },
]

// Function to search tokens by query
export function searchTokens(query: string, tokenList: TokenInfo[] = EXTENDED_TOKEN_LIST): TokenInfo[] {
  if (!query || query.length < 2) return []

  const lowerQuery = query.toLowerCase()
  
  return tokenList.filter(token => 
    token.symbol.toLowerCase().includes(lowerQuery) ||
    token.name.toLowerCase().includes(lowerQuery) ||
    token.address.toLowerCase().includes(lowerQuery) ||
    token.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

// Function to get token by address
export function getTokenByAddress(address: string, tokenList: TokenInfo[] = EXTENDED_TOKEN_LIST): TokenInfo | undefined {
  return tokenList.find(token => token.address === address)
}

// Function to get popular tokens
export function getPopularTokens(): TokenInfo[] {
  return POPULAR_TOKENS
}

// Function to get tokens by tag
export function getTokensByTag(tag: string, tokenList: TokenInfo[] = EXTENDED_TOKEN_LIST): TokenInfo[] {
  return tokenList.filter(token => token.tags?.includes(tag))
}
