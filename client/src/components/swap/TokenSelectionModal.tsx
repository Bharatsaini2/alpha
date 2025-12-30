import React, { useState, useCallback, useRef, useEffect, memo } from "react"
import { Search, X, Clock, Star } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import fallbackImage from "../../assets/default_token.svg"
import { POPULAR_TOKENS, TokenInfo } from "../../lib/tokenList"
import { fetchJupiterTokens, searchJupiterTokens } from "../../lib/jupiterTokens"
import { useJupiterSearch, JupiterTokenResult } from "../../hooks/useJupiterSearch"
import { RiVerifiedBadgeLine } from "react-icons/ri";
import "./swap.css"

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

  const formatBalance = (bal: number): string => {
    if (bal === 0) return "0"
    if (bal < 0.001) return "< 0.001"
    if (bal < 1) return bal.toFixed(6)
    if (bal < 1000) return bal.toFixed(3)
    return bal.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  const formatMcap = (mcap: number): string => {
    if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(2)}B`
    if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(2)}M`
    if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(2)}K`
    return `$${mcap.toFixed(0)}`
  }

  return (
    <button
      onClick={() => onSelect(token)}
      className={`w-full px-3 py-3 flex items-center gap-2 hover:bg-[#1A1A1A] transition-colors ${
        isSelected ? "bg-[#1A1A1A]" : ""
      }`}
    >
      {/* Token Image */}
      <div className="flex-shrink-0">
        <img
          src={token.image || fallbackImage}
          alt={token.symbol}
          className="w-10 h-10 rounded-full border border-[#2B2B2D]"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = fallbackImage
          }}
        />
      </div>

      {/* Token Info */}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{token.symbol}</span>
          {token.isPopular && (
            // <Star size={12} className="text-yellow-400 fill-current" />
            <RiVerifiedBadgeLine size={16} className="text-yellow-400 fill-current" />
          )}
          {token.isVerified && (
            <span className="text-xs text-green-400"> <RiVerifiedBadgeLine/> </span>
          )}
        </div>
        <div className="text-sm text-gray-400 truncate">{token.name}</div>
        {/* Show price and mcap if available from Jupiter Ultra */}
        {(token.usdPrice || token.mcap) && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {token.usdPrice && <span>{formatPrice(token.usdPrice)}</span>}
            {token.mcap && <span>MC: {formatMcap(token.mcap)}</span>}
          </div>
        )}
      </div>

      {/* Balance */}
      {userWallet && (
        <div className="text-right flex-shrink-0">
          {isLoadingBalance ? (
            <div className="w-12 h-4 bg-gray-700 rounded animate-pulse" />
          ) : hasBalance ? (
            <div className="text-sm text-white font-medium">
              {formatBalance(balance!)}
            </div>
          ) : (
            <div className="text-sm text-gray-500">0</div>
          )}
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
function debounce<T extends (...args: unknown[]) => unknown>(
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
  title = "Select Token",
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<TokenInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [recentTokens, setRecentTokens] = useState<TokenInfo[]>([])
  const [userBalances, setUserBalances] = useState<Record<string, number>>({})
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  // Don't load all tokens upfront - only load on search
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokenLoadError, setTokenLoadError] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  
  // Use Jupiter Ultra search hook
  const { searchTokens: searchJupiterUltra, isSearching: isJupiterSearching, error: jupiterError } = useJupiterSearch()

  // Don't load Jupiter tokens upfront - only load when user searches
  // This makes the modal open instantly
  useEffect(() => {
    // Only load tokens from cache if available
    const loadCachedTokens = () => {
      try {
        const cached = localStorage.getItem('jupiter_token_list')
        if (cached) {
          const data = JSON.parse(cached)
          const now = Date.now()
          const CACHE_DURATION = 1000 * 60 * 60 // 1 hour
          
          if (now - data.timestamp < CACHE_DURATION) {
            setAllTokens(data.tokens)
            console.log(`✅ Loaded ${data.tokens.length} tokens from cache`)
          }
        }
      } catch (error) {
        console.error("Failed to load cached tokens:", error)
      }
    }

    if (isOpen) {
      loadCachedTokens()
    }
  }, [isOpen])

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

  // Fetch user token balances when wallet is connected
  useEffect(() => {
    // Mock function to fetch user balances - replace with actual implementation
    const fetchUserBalances = async () => {
      if (!userWallet) return

      setIsLoadingBalances(true)
      try {
        // TODO: Implement actual balance fetching using Solana Web3.js
        // This is a mock implementation
        const mockBalances: Record<string, number> = {
          "So11111111111111111111111111111111111111112": 2.5, // SOL
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 100.0, // USDC
          "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 50.0, // USDT
        }
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500))
        setUserBalances(mockBalances)
      } catch (error) {
        console.error("Failed to fetch user balances:", error)
      } finally {
        setIsLoadingBalances(false)
      }
    }

    if (isOpen && userWallet) {
      fetchUserBalances()
    }
  }, [isOpen, userWallet])

  // Search tokens - use Jupiter Ultra API for real-time data ONLY (no fallback)
  const searchTokens = useCallback(async (query: string): Promise<TokenInfo[]> => {
    if (!query || query.length < 2) return []

    console.log(`🔍 Searching Jupiter Ultra for: "${query}"`)

    // Call Jupiter Ultra search API - no fallback, throw errors
    const jupiterResults = await searchJupiterUltra(query)
    
    console.log(`✅ Found ${jupiterResults.length} tokens from Jupiter Ultra`)
    
    // Convert Jupiter results to TokenInfo format
    const tokens: TokenInfo[] = jupiterResults.map((token: JupiterTokenResult) => ({
      address: token.id,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      image: token.icon || undefined,
      usdPrice: token.usdPrice || undefined,
      mcap: token.mcap || undefined,
      fdv: token.fdv || undefined,
      liquidity: token.liquidity || undefined,
      isVerified: token.isVerified || false,
      tags: token.tags || undefined,
      organicScore: token.organicScore || undefined,
      organicScoreLabel: token.organicScoreLabel || undefined,
    }))
    
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
      } catch (error) {
        console.error("Search error:", error)
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
    } catch (error) {
      console.error("Failed to save recent token:", error)
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

  // Get tokens to display - only show popular tokens by default
  const getDisplayTokens = (): TokenInfo[] => {
    if (searchQuery) {
      return searchResults.filter(token => token.address !== excludeToken)
    }
    
    // Show only popular tokens by default (no loading all tokens)
    const popular = POPULAR_TOKENS.filter(token => token.address !== excludeToken)
    
    const recent = recentTokens.filter(token => 
      token.address !== excludeToken && 
      !popular.some(p => p.address === token.address)
    )
    
    return [...popular, ...recent]
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
            className="relative w-full max-w-md mx-4   shadow-2xl max-h-[80vh] flex flex-col nw-custm-modal-bx"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-[#2B2B2D]">
              <h4 className="text-md font-semibold text-white mb-0">{title}</h4>
              <div className="flex items-center gap-2">
                {tokenLoadError && (
                  <span className="text-xs text-yellow-400" title={tokenLoadError}>
                    ⚠️
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="px-3 py-2 border-b border-[#2B2B2D]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Search by name, symbol, or address..."
                  className="w-full bg-[#16171C] border border-[#2A2A2D] rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none transition-colors"
                />
                {(isSearching || isJupiterSearching) && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              {/* Show Jupiter Ultra badge when searching */}
              {searchQuery && searchQuery.length >= 2 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="px-2 py-1 bg-blue-900/20 border border-blue-500/30 rounded text-blue-400 text-nowrap">
                    Jupiter Ultra
                  </span>
                  <span>Real-time token data with prices & verification</span>
                </div>
              )}
              {/* Show error if Jupiter search fails */}
              {jupiterError && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                  ❌ {jupiterError}
                </div>
              )}
            </div>

            {/* Token List */}

            
              <div className="all-token-trans-bx px-3 py-2">
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
              </div>


            <div className="flex-1 overflow-y-auto token-scrollbar">
              {/* Error State */}
              {tokenLoadError && !isLoadingTokens && (
                <div className="px-4 py-3 bg-yellow-900/20 border-l-4 border-yellow-500 text-yellow-400 text-sm">
                  {tokenLoadError}
                </div>
              )}



              {/* Popular Tokens Section */}
              {!searchQuery && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-0">
                    <RiVerifiedBadgeLine size={16} className="text-yellow-400" />
                    <span className="text-sm font-medium text-gray-400">Popular Tokens</span>
                  </div>
                </div>
              )}

              {/* Recent Tokens Section */}
              {!searchQuery && recentTokens.length > 0 && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-0">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-400">Recent</span>
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

            {/* Footer */}
            <div className="px-3 py-2 border-t border-[#2B2B2D]">
              <p className="fz-14 lh-1 text-white text-center mb-0">
                {searchQuery && searchQuery.length >= 2 
                  ? "Powered by Jupiter Ultra • Real-time prices & verification"
                  : "Search to find any token • Popular tokens shown by default"
                }
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default TokenSelectionModal