import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react"
import { Copy, Search, X, Clock, Trash2 } from "lucide-react"
import axios from "axios"
import fallbackImage from "../assets/default_token.svg"
import { useToast } from "../components/ui/Toast"
import { useSearchHistory } from "../hooks/useSearchHistory"

interface SearchToken {
  id: string
  value: string
  type: "coin" | "whale" | "mixed"
  label: string
  isValid: boolean
  imageUrl?: string
  symbol?: string
  name?: string
  address?: string
}

interface Suggestion {
  type: "coin" | "whale" | "history"
  label: string
  sublabel?: string
  address?: string
  symbol?: string
  name?: string
  imageUrl?: string
  searchValue?: string
  frequency?: number
  lastUsed?: string
  page?: string
}

interface TokenizedSearchInputProps {
  onSearch: (searchData: {
    searchQuery: string
    searchType: "coin" | "whale" | "all" | null
    tokens: Array<{ value: string; type: string }>
    displayQuery?: string // For displaying symbol/name instead of address
  }) => void
  placeholder?: string
  className?: string
  coinOnly?: boolean
  page?: string // Page identifier for search history
  ref?: React.Ref<TokenizedSearchInputHandle>
}

export interface TokenizedSearchInputHandle {
  clearAllTokens: () => void
}

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

const TokenizedSearchInput = React.forwardRef<
  TokenizedSearchInputHandle,
  TokenizedSearchInputProps
>(
  (
    {
      onSearch,
      placeholder = "Search coins, whales, addresses... Use commas for multiple tokens",
      className = "",
      coinOnly = false,
      page = "home",
    },
    ref
  ) => {
    const [inputValue, setInputValue] = useState("")
    const [searchTokens, setSearchTokens] = useState<SearchToken[]>([])
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const [isComposing, setIsComposing] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const { showToast, ToastContainer } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Search history hook
    const { history, saveSearch, deleteHistoryItem, clearHistory } =
      useSearchHistory({
        page,
        enabled: true,
      })

    // Expose clear method to parent component
    useImperativeHandle(ref, () => ({
      clearAllTokens: () => {
        setSearchTokens([])
        setInputValue("")
        executeSearch([])
        // Focus back to input
        setTimeout(() => inputRef.current?.focus(), 0)
      },
    }))

    // Generate unique token ID
    const generateTokenId = () =>
      `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Parse input value into tokens
    const parseTokens = (input: string): string[] => {
      return input
        .split(/[,\\s]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    }

    // Detect token type based on value
    const detectTokenType = (value: string): "coin" | "whale" | "mixed" => {
      if (coinOnly) return "coin" // Force coin type when coinOnly is true
      if (value.startsWith("0x") && value.length > 20) return "coin"
      if (value.length <= 10 && /^[A-Z0-9]+$/i.test(value)) return "coin"
      if (value.toLowerCase().includes("whale")) return "whale"
      return "mixed"
    }

    // Create search token object
    const createSearchToken = (
      value: string | undefined,
      suggestion?: Suggestion
    ): SearchToken => {
      const type =
        suggestion?.type === "history"
          ? detectTokenType(value || "")
          : suggestion?.type || detectTokenType(value || "")
      return {
        id: generateTokenId(),
        value: value || "",
        type: type as "coin" | "whale" | "mixed",
        label: suggestion?.label || value || "",
        isValid: true,
        imageUrl: suggestion?.imageUrl,
        symbol: suggestion?.symbol || "",
        name: suggestion?.name || "",
        address: suggestion?.address || "",
      }
    }

    // Add token to search
    const addToken = (value: string, suggestion?: Suggestion) => {
      let searchValue
      if (suggestion) {
        // Use searchValue if provided (address), otherwise fallback to address or label
        if (suggestion.searchValue) {
          searchValue = suggestion.searchValue
        } else if (suggestion.type === "coin" && suggestion.address) {
          searchValue = suggestion.address
        } else if (suggestion.type === "whale" && suggestion.address) {
          searchValue = suggestion.address
        } else {
          searchValue = suggestion.label
        }
      } else {
        searchValue = value
      }
      const token = createSearchToken(searchValue, suggestion)

      // Check for duplicates
      const isDuplicate = searchTokens.some(
        (t) => t.value.toLowerCase() === value.toLowerCase()
      )

      if (!isDuplicate && value.trim()) {
        const newTokens = [...searchTokens, token]
        setSearchTokens(newTokens)
        executeSearch(newTokens)
      }

      setInputValue("")
      setShowSuggestions(false)
      setSelectedIndex(-1)

      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    // Remove token
    const removeToken = (tokenId: string) => {
      const newTokens = searchTokens.filter((token) => token.id !== tokenId)
      setSearchTokens(newTokens)
      executeSearch(newTokens)

      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    const handleCopyTokenAddress = async (
      tokenAddress: string,
      _transactionId: string
    ) => {
      try {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(tokenAddress)
        } else {
          // Fallback for older browsers or mobile devices
          const textArea = document.createElement("textarea")
          textArea.value = tokenAddress
          textArea.style.position = "fixed"
          textArea.style.left = "-999999px"
          textArea.style.top = "-999999px"
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          document.execCommand("copy")
          document.body.removeChild(textArea)
        }

        showToast("Address copied to clipboard!", "success")
      } catch (error) {
        console.error("Failed to copy token address:", error)
        showToast("Failed to copy address", "error")
      }
    }

    // Clear all tokens
    const clearAllTokens = () => {
      setSearchTokens([])
      setInputValue("")
      // Execute search with empty tokens to clear filters
      executeSearch([])

      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    // Execute search with current tokens
    const executeSearch = (tokens: SearchToken[]) => {
      const searchQuery = tokens.map((token) => token.value).join(", ")
      const displayQuery = tokens.map((token) => token.label).join(", ")

      let searchType: "coin" | "whale" | "all" | null = null

      if (coinOnly) {
        searchType = "coin" // Force coin search when coinOnly is true
      } else {
        const hasCoins = tokens.some(
          (t) => t.type === "coin" || t.type === "mixed"
        )
        const hasWhales = tokens.some(
          (t) => t.type === "whale" || t.type === "mixed"
        )

        if (hasCoins && !hasWhales) searchType = "coin"
        else if (hasWhales && !hasCoins) searchType = "whale"
      }

      // Save to search history if we have a valid search
      if (searchQuery.trim() && searchType) {
        // Prepare token data for history
        const tokenData = tokens.map((token) => ({
          value: token.value,
          type: token.type,
          label: token.label,
          imageUrl: token.imageUrl,
          symbol: token.symbol,
          name: token.name,
          address: token.address,
        }))

        saveSearch(searchQuery, searchType, tokenData)
      }

      onSearch({
        searchQuery,
        searchType,
        tokens: tokens.map((t) => ({ value: t.value, type: t.type })),
        displayQuery,
      })
    }

    // Fetch suggestions (debounced)
    const debouncedFetchSuggestions = useCallback(
      debounce(async (query: string) => {
        if (query.length < 2) {
          setSuggestions([])
          setIsLoading(false)
          return
        }

        setIsLoading(true)

        try {
          const BASE_URL =
            import.meta.env.VITE_SERVER_URL || "http://localhost:9090"

          let response
          if (coinOnly) {
            // Use dedicated coin suggestions endpoint
            response = await axios.get(
              `${BASE_URL}/whale/coin-suggestions?q=${encodeURIComponent(query)}&limit=20`
            )

            if (response.status !== 200) return
            const apiSuggestions = response.data?.suggestions || []

            setSuggestions(apiSuggestions)
            return
          } else {
            // Use original whale transactions endpoint
            response = await axios.get(
              `${BASE_URL}/whale/whale-transactions?search=${encodeURIComponent(query)}&limit=8&searchType=all`
            )

            if (response.status !== 200) return
            const txs = response.data?.transactions || []

            // Whale suggestions
            const whaleSugs: Suggestion[] = txs
              .map((tx: any) => {
                const w = tx.whale || {}
                const address = w.address || tx.whaleAddress
                const name = w.name
                const label = name || address
                if (!address || !label) return null
                return {
                  type: "whale",
                  label,
                  sublabel: name
                    ? address
                    : w.labels?.[0] || tx.whaleLabel?.[0],
                  address,
                  name,
                  imageUrl: tx.whaleImageUrl || w.imageUrl,
                }
              })
              .filter(Boolean)

            // Coin suggestions (from both sides)
            const coinSugs: Suggestion[] = txs.flatMap((tx: any) => {
              const items = []
              const sellSide = tx.type === "sell"
              const sideA = sellSide
                ? tx.transaction?.tokenIn
                : tx.transaction?.tokenOut
              const sideB = !sellSide
                ? tx.transaction?.tokenIn
                : tx.transaction?.tokenOut

              for (const side of [sideA, sideB]) {
                if (!side) continue
                const symbol = side.symbol
                const name = side.name
                const address = side.address
                if (!(symbol || name || address)) continue
                items.push({
                  type: "coin",
                  label: symbol || name || address,
                  sublabel: name && symbol ? `${name}` : address,
                  address,
                  symbol,
                  name,
                  imageUrl: side.imageUrl,
                } as Suggestion)
              }
              return items
            })

            // Deduplicate separately per type
            const uniq = (
              arr: Suggestion[],
              key: (s: Suggestion) => string
            ) => {
              const seen = new Set<string>()
              return arr.filter((s) => {
                const k = key(s)
                if (!k || seen.has(k)) return false
                seen.add(k)
                return true
              })
            }

            const uniqueWhales = uniq(
              whaleSugs as Suggestion[],
              (s) => s.address || s.label
            )
            const uniqueCoins = uniq(
              coinSugs as Suggestion[],
              (s) => s.symbol || s.address || s.label
            )

            setSuggestions([...uniqueWhales, ...uniqueCoins])
          }
        } catch (error) {
          console.error("Error fetching suggestions:", error)
          setSuggestions([])
        } finally {
          setIsLoading(false)
        }
      }, 300),
      []
    )

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setInputValue(value)

      if (value.trim() && !isComposing) {
        debouncedFetchSuggestions(value.trim())
        setShowSuggestions(true)
        setShowHistory(false)
      } else if (!value.trim()) {
        setShowSuggestions(false)
        setShowHistory(true) // Show history when input is empty
      } else {
        setShowSuggestions(false)
        setShowHistory(false)
      }

      setSelectedIndex(-1)
    }

    // Handle key events
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (isComposing) return

      switch (e.key) {
        case "Enter": {
          e.preventDefault()
          const filteredSuggestions = suggestions.filter(
            (suggestion) =>
              suggestion.symbol
                ?.toLowerCase()
                .includes(inputValue.toLowerCase()) ||
              suggestion.name
                ?.toLowerCase()
                .includes(inputValue.toLowerCase()) ||
              suggestion.label
                ?.toLowerCase()
                .includes(inputValue.toLowerCase()) ||
              suggestion.address
                ?.toLowerCase()
                .includes(inputValue.toLowerCase())
          )
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            filteredSuggestions[selectedIndex]
          ) {
            addToken(
              filteredSuggestions[selectedIndex].label,
              filteredSuggestions[selectedIndex]
            )
          } else if (inputValue.trim()) {
            // Handle multi-token input (comma separated)
            const tokens = parseTokens(inputValue)
            tokens.forEach((token) => addToken(token))
          }
          break
        }

        case "Backspace":
          if (!inputValue && searchTokens.length > 0) {
            removeToken(searchTokens[searchTokens.length - 1].id)
          }
          break

        case "ArrowDown":
          if (showSuggestions && suggestions.length > 0) {
            e.preventDefault()
            const filteredSuggestions = suggestions.filter(
              (suggestion) =>
                suggestion.symbol
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.name
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.label
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.address
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase())
            )

            setSelectedIndex((prev) => {
              const max = filteredSuggestions.length - 1

              return prev < max ? prev + 1 : 0
            })
          }
          break

        case "ArrowUp":
          if (showSuggestions && suggestions.length > 0) {
            e.preventDefault()
            const filteredSuggestions = suggestions.filter(
              (suggestion) =>
                suggestion.symbol
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.name
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.label
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase()) ||
                suggestion.address
                  ?.toLowerCase()
                  .includes(inputValue.toLowerCase())
            )
            setSelectedIndex((prev) => {
              const max = filteredSuggestions.length - 1
              return prev > 0 ? prev - 1 : max
            })
          }
          break

        case "Escape":
          setShowSuggestions(false)
          setSelectedIndex(-1)
          break

        case ",":
          if (inputValue.trim()) {
            e.preventDefault()
            addToken(inputValue.trim())
          }
          break
      }
    }

    // Handle suggestion selection
    const handleSuggestionClick = (suggestion: Suggestion) => {
      addToken(suggestion.label, suggestion)
    }

    // Handle input focus
    const handleInputFocus = () => {
      if (!inputValue.trim() && history.length > 0) {
        setShowHistory(true)
      }
    }

    // Handle input blur
    const handleInputBlur = () => {
      // Delay hiding to allow for suggestion clicks
      setTimeout(() => {
        setShowHistory(false)
      }, 200)
    }

    // Handle click outside to close suggestions
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setShowSuggestions(false)
          setShowHistory(false)
          setSelectedIndex(-1)
        }
      }

      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Token type styling
    const getTokenStyle = (type: string) => {
      switch (type) {
        case "whale":
          return "border border-white/70 bg-black"
        case "coin":
          return "border border-white/70 bg-black"
        default:
          return "border border-white/70 bg-black"
      }
    }

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* Main input container */}
        <div className="flex-1 w-full shadow-[0_0_10px_2px_rgba(255,255,255,0.4)] rounded-xl">
          <div className="relative">
            {/* Search icon */}
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-6 h-6 text-white z-10" />

            {/* Token container and input */}
            <div className="w-full bg-[#16171C] border border-[#2A2A2D] focus-within:border-white rounded-xl pl-12 pr-12 py-2 min-h-[48px] flex flex-wrap items-center gap-2 transition-all">
              {/* Render search tokens */}
              {searchTokens.map((token) => (
                <div
                  key={token.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all hover:scale-105 ${getTokenStyle(token.type)}`}
                >
                  <img
                    src={token.imageUrl || fallbackImage}
                    alt={token.label}
                    className="w-4 h-4 rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = fallbackImage
                    }}
                  />
                  <span className="max-w-[120px] truncate">{token.label}</span>
                  <button
                    onClick={() => removeToken(token.id)}
                    className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-all"
                    title={`Remove ${token.label}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {/* Input field */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={
                  searchTokens.length === 0 ? placeholder : "Add more..."
                }
                className="flex-1 bg-transparent text-white placeholder-white/60 outline-none min-w-[120px]"
              />

              {/* Loading indicator */}
              {isLoading && (
                <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                </div>
              )}
            </div>

            {/* Clear all button */}
            {searchTokens.length > 0 && (
              <button
                onClick={clearAllTokens}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-all"
                title="Clear all tokens"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Search History dropdown */}
          {showHistory && history.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#2B2B2D]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Clock size={16} />
                    <span>Recent searches</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearHistory()
                    }}
                    className="text-gray-400 hover:text-red-400 text-xs transition-all px-2 py-1 rounded hover:bg-red-400/10 cursor-pointer"
                    title="Clear all history"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              {history.slice(0, 10).map((item) => (
                <button
                  key={item._id}
                  onClick={() => {
                    // If item has tokens, restore all tokens; otherwise use query
                    if (item.tokens && item.tokens.length > 0) {
                      // Restore all tokens from history
                      const historyTokens = item.tokens.map((token) => ({
                        id: `${token.value}-${Date.now()}-${Math.random()}`,
                        value: token.value,
                        type: token.type as "coin" | "whale" | "mixed",
                        label: token.label,
                        isValid: true,
                        imageUrl: token.imageUrl,
                        symbol: token.symbol,
                        name: token.name,
                        address: token.address,
                      }))
                      setSearchTokens(historyTokens)
                      executeSearch(historyTokens)
                    } else {
                      // Fallback to old behavior
                      addToken(item.query)
                    }
                    setShowHistory(false)
                  }}
                  className="w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 hover:bg-[#1A1A1A] text-white cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {item.tokens && item.tokens.length > 0 ? (
                          // Show first token's image if available
                          <img
                            src={item.tokens[0].imageUrl || fallbackImage}
                            alt={item.tokens[0].label}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-[5px] border border-[#2B2B2D]"
                            style={{ objectFit: "cover" }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = fallbackImage
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center">
                            <span className="text-xs">
                              {item.searchType === "coin"
                                ? "🪙"
                                : item.searchType === "whale"
                                  ? "🐋"
                                  : "🔍"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-white truncate">
                          {item.tokens && item.tokens.length > 0
                            ? item.tokens.map((token) => token.label).join(", ")
                            : item.query}
                        </div>
                        {item.tokens && item.tokens.length > 0 && (
                          <div className="text-gray-400 text-xs">
                            {item.tokens[0].symbol ||
                              item.tokens[0].address?.slice(0, 8) + "..."}
                          </div>
                        )}
                        <div className="text-gray-400 text-xs">
                          {new Date(item.lastUsed).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteHistoryItem(item._id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
                      title="Remove from history"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              {(() => {
                const filteredSuggestions = suggestions.filter(
                  (coin) =>
                    coin.symbol
                      ?.toLowerCase()
                      .includes(inputValue.toLowerCase()) ||
                    coin.name
                      ?.toLowerCase()
                      .includes(inputValue.toLowerCase()) ||
                    coin.label
                      ?.toLowerCase()
                      .includes(inputValue.toLowerCase()) ||
                    coin.address
                      ?.toLowerCase()
                      .includes(inputValue.toLowerCase())
                )
                return filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.label}-${index}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 ${
                      index === selectedIndex
                        ? "bg-[#1A1A1A] text-white"
                        : "hover:bg-[#1A1A1A] text-white"
                    } cursor-pointer`}
                  >
                    <div className="flex items-center space-x-3 ">
                      {/* Image */}
                      <div className="flex-shrink-0">
                        {suggestion.imageUrl ? (
                          <img
                            src={
                              suggestion.label === "SOL"
                                ? "https://assets.coingecko.com/coins/images/4128/large/solana.png?1696501504"
                                : suggestion.imageUrl
                            }
                            alt={suggestion.label}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-[5px] border border-[#2B2B2D]"
                            style={{ objectFit: "cover" }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = fallbackImage
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center">
                            <span className="text-xs">
                              {suggestion.type === "whale" ? "🐋" : "🪙"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-white truncate">
                            {suggestion.label}
                          </span>
                        </div>
                        {suggestion.sublabel && (
                          <div className="text-gray-400 text-xs truncate">
                            {suggestion.sublabel}
                          </div>
                        )}

                        {suggestion.address && (
                          <div className="text-gray-500 text-xs font-mono truncate flex items-center gap-1 cursor-pointer">
                            {suggestion.address &&
                            suggestion.address.length > 20
                              ? `${suggestion.address.slice(0, 6)}...${suggestion.address.slice(-4)}`
                              : suggestion.address || "Unknown"}
                            <Copy
                              className="w-3 h-3 text-white"
                              onClick={() =>
                                handleCopyTokenAddress(
                                  suggestion.address || "",
                                  ""
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              })()}
            </div>
          )}
        </div>
        <ToastContainer />
      </div>
    )
  }
)

TokenizedSearchInput.displayName = "TokenizedSearchInput"

export default TokenizedSearchInput
