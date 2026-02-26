import React, { useState, useCallback, useRef, useEffect, memo } from "react"
import { Search, X, TrendingUp } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import fallbackImage from "../../assets/default_token.svg"
import { POPULAR_TOKENS, TokenInfo } from "../../lib/tokenList"

import { useJupiterSearch, JupiterTokenResult } from "../../hooks/useJupiterSearch"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { RiVerifiedBadgeFill } from "react-icons/ri";

import "./swap.css"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCopy } from "@fortawesome/free-solid-svg-icons"

// Re-export TokenInfo for backward compatibility
export type { TokenInfo }

// Memoized Token Item Component for better performance
const TokenItem = memo<{
  token: TokenInfo
  isSelected: boolean
  balance?: number
  isLoadingBalance: boolean
  userWallet?: string
  onSelect: (token: TokenInfo) => void
}>(({ token, isSelected, balance, isLoadingBalance, userWallet, onSelect }) => {
  const hasBalance = balance !== undefined && balance > 0

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  const truncateAddress = (addr: string) => {
    if (!addr) return "..."
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
  }



  const formatBalance = (bal: number) => {
    if (bal === 0) return "0"
    if (bal < 0.000001) return "< 0.000001"
    if (bal < 0.1) return bal.toFixed(6)
    if (bal < 100) return bal.toFixed(4)
    return bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  return (
    <button
      onClick={() => onSelect(token)}
      className={`w-full px-3 py-3 flex items-center gap-3 hover:bg-[#1A1A1A] transition-colors border-b border-[#1A1A1A/50] ${isSelected ? "bg-[#1A1A1A]" : ""
        }`}
    >
      {/* Token Image - Sharp Square (Medium Size) */}
      <div className="flex-shrink-0">
        <img
          src={token.image || fallbackImage}
          alt={token.symbol}
          className="w-[56px] h-[56px] rounded-none object-cover bg-[#0A0A0A]"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = fallbackImage
          }}
        />
      </div>

      {/* Token Info Stack */}
      <div className="flex-1 text-left min-w-0 flex flex-col justify-center gap-0.5 h-[56px]">
        {/* Row 1: Symbol + Badge */}
        <div className="flex items-center gap-1.5 leading-none">
          <h6 className="text-[13px] font-bold text-white mb-0">{token.symbol}</h6>
          {(token.isPopular || (token.isVerified && !token.isPopular)) && (
            <RiVerifiedBadgeFill size={12} className="text-[#00D9AC] fill-current" />
          )}
        </div>

        {/* Row 2: Name */}
        <div className="text-[9px] text-gray-400 font-medium uppercase tracking-wider leading-none truncate">
          {token.name}
        </div>

        {/* Row 3: CA */}
        <div className="flex items-center gap-1.5 group">
          <span className="text-[9px] text-gray-500 font-mono leading-none">CA:</span>
          <span className="text-[9px] text-gray-500 font-mono leading-none truncate max-w-[100px]">{truncateAddress(token.address)}</span>
          <div
            role="button"
            className="text-gray-600 hover:text-gray-400 transition-colors cursor-pointer flex items-center"
            onClick={(e) => handleCopy(e, token.address)}
          >
            <FontAwesomeIcon icon={faCopy} className="text-[9px]" />
          </div>
        </div>

        {/* Row 4: Price */}
        {token.usdPrice && (
          <div className="flex items-center gap-2 text-[10px] font-mono leading-none">
            <span className="text-gray-300 font-medium">
              {formatPrice(token.usdPrice)}
            </span>
          </div>
        )}
      </div>

      {/* Balance - Top Aligned */}
      {userWallet && (
        <div className="text-right flex-shrink-0 flex flex-col items-end pt-1">
          {isLoadingBalance ? (
            <div className="w-12 h-4 bg-gray-800 rounded animate-pulse" />
          ) : hasBalance ? (
            <>
              <div className="text-sm font-bold text-white leading-none mb-1">
                {formatBalance(balance!)}
              </div>
            </>
          ) : null}
        </div>
      )}
    </button>
  )
})

// Props interface for the modal
export interface TokenSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onTokenSelect: (token: TokenInfo) => void
  excludeToken?: string // Don't show the currently selected token
  userWallet?: string // For fetching balances
  title?: string
}

// Recent selections storage key
const RECENT_TOKENS_KEY = "swap_recent_tokens"
const MAX_RECENT_TOKENS = 5

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export const TokenSelectionModal: React.FC<TokenSelectionModalProps> = ({
  isOpen,
  onClose,
  onTokenSelect,
  excludeToken,
  userWallet,
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<TokenInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [recentTokens, setRecentTokens] = useState<TokenInfo[]>([])
  const [userBalances, setUserBalances] = useState<Record<string, number>>({})
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [topWalletTokens, setTopWalletTokens] = useState<TokenInfo[]>([])
  const [isCalculatingTopTokens, setIsCalculatingTopTokens] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Use Jupiter Ultra search hook
  const { searchTokens: searchJupiterUltra, isSearching: isJupiterSearching, error: jupiterError } = useJupiterSearch()



  // Load recent tokens from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_TOKENS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setRecentTokens(Array.isArray(parsed) ? parsed : [])
      }
    } catch (error) {
      console.error("Failed to load recent tokens:", error)
    }
  }, [])

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Use wallet connection hook for fetching balances
  const { getAllTokenBalances, getBalance } = useWalletConnection()

  // Fetch user token balances when wallet is connected
  useEffect(() => {
    const fetchUserBalances = async () => {
      if (!userWallet) return

      setIsLoadingBalances(true)
      try {
        const balances: Record<string, number> = {}

        // 1. Fetch Native SOL Balance
        try {
          const solBalance = await getBalance(undefined, userWallet)
          // Native SOL address
          balances["So11111111111111111111111111111111111111112"] = solBalance
        } catch (err) {
          console.error("Failed to fetch SOL balance:", err)
        }

        // 2. Fetch SPL Token Balances
        try {
          const tokenBalances = await getAllTokenBalances(userWallet)
          tokenBalances.forEach(token => {
            // Use uiAmount for display
            balances[token.mint] = token.uiAmount
          })
        } catch (err) {
          console.error("Failed to fetch token balances:", err)
        }

        setUserBalances(balances)
      } catch (error) {
        console.error("Failed to fetch user balances:", error)
      } finally {
        setIsLoadingBalances(false)
      }
    }

    if (isOpen && userWallet) {
      fetchUserBalances()
    }
  }, [isOpen, userWallet, getAllTokenBalances, getBalance])

  // Calculate top wallet tokens by USD value
  useEffect(() => {
    const calculateTopTokens = async () => {
      setIsCalculatingTopTokens(true)
      if (!userWallet || Object.keys(userBalances).length === 0) {
        setTopWalletTokens([])
        setIsCalculatingTopTokens(false)
        return
      }

      // Create array of tokens with their USD values
      const tokensWithValue: Array<TokenInfo & { balance: number; usdValue: number }> = []

      for (const [address, balance] of Object.entries(userBalances)) {
        if (balance <= 0) continue

        // Try to find token in POPULAR_TOKENS first
        let tokenInfo = POPULAR_TOKENS.find(t => t.address === address)

        if (!tokenInfo) {
          // If not found, try to fetch from Jupiter API
          try {
            const results = await searchJupiterUltra(address)
            if (results.length > 0) {
              const jupToken = results[0]
              tokenInfo = {
                address: jupToken.id,
                symbol: jupToken.symbol,
                name: jupToken.name,
                decimals: jupToken.decimals,
                image: jupToken.icon || undefined,
                usdPrice: jupToken.usdPrice && jupToken.usdPrice < 100000 ? jupToken.usdPrice : undefined,
                mcap: jupToken.mcap || undefined,
                isVerified: jupToken.isVerified || false,
              }
            }
          } catch (error) {
            console.error(`Failed to fetch token metadata for ${address}:`, error)
            // Skip this token if we can't get metadata
            continue
          }
        }

        if (!tokenInfo) continue

        const usdPrice = tokenInfo.usdPrice || 0
        const usdValue = balance * usdPrice

        tokensWithValue.push({
          ...tokenInfo,
          balance,
          usdValue
        })
      }

      // Sort by USD value (descending) and take top 4
      const topTokens = tokensWithValue
        .sort((a, b) => b.usdValue - a.usdValue)
        .slice(0, 4)
        .map(({ balance: _b, usdValue: _v, ...token }) => token)

      setTopWalletTokens(topTokens)
      setIsCalculatingTopTokens(false)
    }

    calculateTopTokens()
  }, [userBalances, userWallet, searchJupiterUltra])

  // Search tokens - use Jupiter Ultra API for real-time data ONLY (no fallback)
  const searchTokens = useCallback(async (query: string): Promise<TokenInfo[]> => {
    if (!query || query.length < 2) return []

    // Call Jupiter Ultra search API - no fallback, throw errors
    const jupiterResults = await searchJupiterUltra(query)

    // Convert Jupiter results to TokenInfo format
    const tokens: TokenInfo[] = jupiterResults.map((token: JupiterTokenResult) => {
      // Validate usdPrice - if it's suspiciously high, it might be mcap instead of price
      let validatedPrice = token.usdPrice || undefined

      // If usdPrice is greater than $100k, it's probably market cap or wrong data
      if (validatedPrice && validatedPrice > 100000) {
        validatedPrice = undefined // Clear it so it gets fetched properly later
      }

      return {
        address: token.id,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        image: token.icon || undefined,
        usdPrice: validatedPrice,
        mcap: token.mcap || undefined,
        fdv: token.fdv || undefined,
        liquidity: token.liquidity || undefined,
        isVerified: token.isVerified || false,
        tags: token.tags || undefined,
        organicScore: token.organicScore || undefined,
        organicScoreLabel: token.organicScoreLabel || undefined,
      }
    })

    return tokens
  }, [searchJupiterUltra])

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim() || query.length < 2) {
        setSearchResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const results = await searchTokens(query)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300),
    [searchTokens]
  )

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    setSelectedIndex(-1)
    debouncedSearch(value)
  }

  // Save token to recent selections
  const saveToRecent = useCallback((token: TokenInfo) => {
    try {
      const existing = recentTokens.filter(t => t.address !== token.address)
      const updated = [token, ...existing].slice(0, MAX_RECENT_TOKENS)
      setRecentTokens(updated)
      localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(updated))
    } catch {
      // Failed to save recent token
    }
  }, [recentTokens])

  // Handle token selection
  const handleTokenSelect = (token: TokenInfo) => {
    saveToRecent(token)
    onTokenSelect(token)
    onClose()
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const allTokens = searchQuery ? searchResults : [...POPULAR_TOKENS, ...recentTokens]
    const filteredTokens = allTokens.filter(token => token.address !== excludeToken)

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredTokens.length - 1 ? prev + 1 : 0
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : filteredTokens.length - 1
        )
        break
      case "Enter":
        e.preventDefault()
        if (selectedIndex >= 0 && filteredTokens[selectedIndex]) {
          handleTokenSelect(filteredTokens[selectedIndex])
        }
        break
      case "Escape":
        onClose()
        break
    }
  }

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  // Get tokens to display - search results or popular tokens only
  const getDisplayTokens = (): TokenInfo[] => {
    if (searchQuery) {
      return searchResults.filter(token => token.address !== excludeToken)
    }

    // Show only popular tokens (wallet tokens are shown separately in Top Holdings section)
    return POPULAR_TOKENS.filter(token => token.address !== excludeToken)
  }

  const displayTokens = getDisplayTokens()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg mx-4   shadow-2xl max-h-[80vh] flex flex-col nw-custm-modal-bx"
          >
            {/* Header */}
            <div className=" gap-2 flex items-center justify-between px-3  py-2 border-b border-[#2B2B2D]">
              {/* <h4 className="text-md font-semibold text-white mb-0">{title}</h4> */}
              <div className="flex-grow-1">
                <div className="relative custom-frm-bx mb-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Search by name, symbol, or address..."
                    className="form-control "
                    style={{ paddingLeft: "35px", paddingRight: searchQuery ? "35px" : "12px" }}
                  />
                  {searchQuery && !isSearching && !isJupiterSearching && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {(isSearching || isJupiterSearching) && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>

                {/* {searchQuery && searchQuery.length >= 2 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="px-2 py-1 bg-blue-900/20 border border-blue-500/30 rounded text-blue-400 text-nowrap">
                    Jupiter Ultra
                  </span>
                  <span>Real-time token data with prices & verification</span>
                </div>
              )} */}

                {jupiterError && (
                  <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                    ❌ {jupiterError}
                  </div>
                )}
              </div>


              <div className="flex items-center gap-2">

                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
            </div>


            {/* <div className="px-3 py-2 border-b border-[#2B2B2D]">
              <div className="relative custom-frm-bx">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Search by name, symbol, or address..."
                  className="form-control "
                  style={{paddingLeft : "35px"}}
                />
                {(isSearching || isJupiterSearching) && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
    
              {searchQuery && searchQuery.length >= 2 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="px-2 py-1 bg-blue-900/20 border border-blue-500/30 rounded text-blue-400 text-nowrap">
                    Jupiter Ultra
                  </span>
                  <span>Real-time token data with prices & verification</span>
                </div>
              )}
        }
              {jupiterError && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                  ❌ {jupiterError}
                </div>
              )}
            </div> */}

            {/* Token List */}


            <div className="all-token-trans-bx px-3 py-2">
              {/* Show skeleton loading while calculating top tokens */}
              {isCalculatingTopTokens && userWallet && (
                <div className="grid grid-cols-2 gap-2 w-full">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="token-btn-large">
                      <div className="flex items-center gap-2 w-full">
                        <div className="w-10 h-10 bg-gray-700 rounded animate-pulse flex-shrink-0" />
                        <div className="flex-1 text-left min-w-0">
                          <div className="h-3 bg-gray-700 rounded w-16 mb-1 animate-pulse" />
                          <div className="h-2 bg-gray-700 rounded w-12 mb-1 animate-pulse" />
                          <div className="h-2 bg-gray-700 rounded w-14 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Show top wallet holdings */}
              {!isCalculatingTopTokens && topWalletTokens.length > 0 && (
                <div className="grid grid-cols-2 gap-2 w-full">
                  {topWalletTokens.map((token) => {
                    const balance = userBalances[token.address] || 0


                    const formatBalance = (bal: number): string => {
                      if (bal === 0) return "0"
                      if (bal < 0.000001) return "< 0.000001"
                      if (bal < 0.1) return bal.toFixed(6)
                      if (bal < 100) return bal.toFixed(4)
                      return bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    }

                    return (
                      <button
                        key={token.address}
                        className="token-btn-large"
                        onClick={() => handleTokenSelect(token)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <img
                            src={token.image || fallbackImage}
                            alt={token.symbol}
                            className="w-10 h-10 rounded flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = fallbackImage
                            }}
                          />
                          <div className="flex-1 text-left overflow-hidden">
                            <div className="text-xs font-medium text-white truncate">{token.symbol}</div>
                            <div className="text-[10px] text-gray-400 truncate">{formatBalance(balance)}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Show default icons if no wallet or no tokens */}
              {!userWallet && (
                <>
                  <button className="token-btn">
                    <img src="/btn-icon.png" alt="" />
                  </button>
                  <button className="token-btn">
                    <img src="/t-1.png" alt="" />
                  </button>
                  <button className="token-btn">
                    <img src="/t-2.png" alt="" />
                  </button>
                  <button className="token-btn">
                    <img src="/t-3.png" alt="" />
                  </button>
                </>
              )}
            </div>


            <div className="flex-1 overflow-y-auto token-scrollbar">





              {/* {!searchQuery && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-0">
                    <RiVerifiedBadgeLine size={16} className="text-yellow-400" />
                    <span className="text-sm font-medium text-gray-400">Popular Tokens</span>
                  </div>
                </div>
              )} */}

              {/* Popular Tokens Section */}
              {!searchQuery && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-0">
                    <TrendingUp size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-400">Popular</span>
                  </div>
                </div>
              )}

              {/* Token Items */}
              <div className="pb-0">
                {displayTokens.length === 0 && !isSearching && !isJupiterSearching && searchQuery && searchQuery.length >= 2 && (
                  <div className="px-3 py-8 text-center text-gray-400">
                    <Search size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No tokens found</p>
                    <p className="text-sm">Try searching with a different term</p>
                  </div>
                )}

                {/* Show hint for short queries */}
                {searchQuery && searchQuery.length < 2 && (
                  <div className="px-3 py-8 text-center text-gray-400">
                    <Search size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Type at least 2 characters to search</p>
                  </div>
                )}

                {/* Limit displayed tokens to prevent lag (show max 50 at a time) */}
                {displayTokens.slice(0, 50).map((token, index) => (
                  <TokenItem
                    key={token.address}
                    token={token}
                    isSelected={index === selectedIndex}
                    balance={userBalances[token.address]}
                    isLoadingBalance={isLoadingBalances}
                    userWallet={userWallet}
                    onSelect={handleTokenSelect}
                  />
                ))}

                {/* Show message if more tokens available */}
                {displayTokens.length > 50 && (
                  <div className="px-4 py-3 text-center text-sm text-gray-400">
                    Showing 50 of {displayTokens.length} tokens. Refine your search to see more.
                  </div>
                )}
              </div>
            </div>


            {/* <div className="px-3 py-2 border-t border-[#2B2B2D]">
              <p className="fz-14 lh-1 text-white text-center mb-0">
                {searchQuery && searchQuery.length >= 2 
                  ? "Powered by Jupiter Ultra • Real-time prices & verification"
                  : "Search to find any token • Popular tokens shown by default"
                }
              </p>
            </div> */}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default TokenSelectionModal