import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useImperativeHandle,
} from "react"
import { Copy, Search, X, Clock, Trash2 } from "lucide-react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faSearch } from "@fortawesome/free-solid-svg-icons"
import axios from "axios"
import fallbackImage from "../assets/default_token.svg"
import { useToast } from "../contexts/ToastContext"
import { useRecentSearches } from "../hooks/useRecentSearches"

const SUGGESTIONS_BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

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
  page?: string // Page identifier for recent searches (e.g. "home" => alpha)
  transactions?: any[] // Already loaded transactions for frontend-only suggestions
  /** When true, use original design: single input + search btn + dropdown (no token chips) */
  simpleDesign?: boolean
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
      transactions = [],
      simpleDesign = false,
    },
    ref
  ) => {
    const [inputValue, setInputValue] = useState("")
    const [searchTokens, setSearchTokens] = useState<SearchToken[]>([])
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const [isComposing, setIsComposing] = useState(false)
    const [showRecent, setShowRecent] = useState(false)
    const { showToast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const { recent, addRecent, clearRecent, removeRecent } = useRecentSearches(
      page === "kol-feed" ? "kol" : "alpha"
    )

    // Unique tokens from transactions (frontend-only search source)
    const uniqueTokensFromTx = useMemo(() => {
      const map = new Map<string, Suggestion>()
      for (const tx of transactions) {
        const add = (
          address: string | undefined,
          symbol: string | undefined,
          name: string | undefined,
          imageUrl: string | undefined
        ) => {
          if (!address) return
          const key = address.toLowerCase()
          if (map.has(key)) return
          map.set(key, {
            type: "coin",
            label: symbol || name || address,
            sublabel: name && symbol ? name : undefined,
            address,
            symbol,
            name,
            imageUrl,
          })
        }
        const tokenIn = tx.transaction?.tokenIn
        const tokenOut = tx.transaction?.tokenOut
        if (tokenIn && tx.tokenInAddress) {
          add(
            tx.tokenInAddress,
            tokenIn.symbol ?? tx.tokenInSymbol,
            tokenIn.name,
            tx.inTokenURL
          )
        }
        if (tokenOut && tx.tokenOutAddress) {
          add(
            tx.tokenOutAddress,
            tokenOut.symbol ?? tx.tokenOutSymbol,
            tokenOut.name,
            tx.outTokenURL
          )
        }
      }
      return Array.from(map.values())
    }, [transactions])

    // Expose clear method to parent component
    useImperativeHandle(ref, () => ({
      clearAllTokens: () => {
        setSearchTokens([])
        setInputValue("")
        if (simpleDesign) {
          onSearch({
            searchQuery: "",
            searchType: null,
            tokens: [],
            displayQuery: "",
          })
        } else {
          executeSearch([])
        }
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

      // Save to localStorage recent searches (max 10)
      if (searchQuery.trim() && searchType) {
        tokens.slice(0, 10).forEach((token) => {
          addRecent({
            type: "token",
            label: token.label,
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            imageUrl: token.imageUrl,
          })
        })
      }

      onSearch({
        searchQuery,
        searchType,
        tokens: tokens.map((t) => ({ value: t.value, type: t.type })),
        displayQuery,
      })
    }

    // Suggestions: backend (all coins in DB) + frontend (loaded tx) merged, debounced 300ms
    const debouncedSetSuggestions = useCallback(
      debounce(async (query: string) => {
        const q = query.trim()
        if (q.length < 1) {
          setSuggestions([])
          return
        }
        const qLower = q.toLowerCase()
        const isLikelyAddress =
          q.length >= 20 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q)

        // 1) Instant: frontend filter from loaded transactions
        const fromFrontend = uniqueTokensFromTx.filter((s) => {
          const name = (s.name || "").toLowerCase()
          const symbol = (s.symbol || "").toLowerCase()
          const label = (s.label || "").toLowerCase()
          const address = (s.address || "").toLowerCase()
          if (isLikelyAddress) return address.includes(qLower) || address === qLower
          return (
            name.includes(qLower) ||
            symbol.includes(qLower) ||
            label.includes(qLower) ||
            address.includes(qLower)
          )
        })
        const seen = new Set<string>()
        const merged: Suggestion[] = []
        fromFrontend.slice(0, 20).forEach((s) => {
          const key = (s.address || "").toLowerCase()
          if (key && !seen.has(key)) {
            seen.add(key)
            merged.push(s)
          }
        })

        // 2) Backend: fetch all matching coins from API (searches full token set)
        try {
          const res = await axios.get(
            `${SUGGESTIONS_BASE_URL}/whale/coin-suggestions?q=${encodeURIComponent(q)}&limit=30`
          )
          const apiList = res.data?.suggestions || []
          apiList.forEach((s: any) => {
            const key = (s.address || "").toLowerCase()
            if (!key || seen.has(key)) return
            seen.add(key)
            merged.push({
              type: "coin",
              label: s.symbol || s.name || s.address,
              sublabel: s.name && s.symbol ? s.name : s.address,
              address: s.address,
              symbol: s.symbol,
              name: s.name,
              imageUrl: s.imageUrl,
            })
          })
        } catch (err) {
          console.error("Coin suggestions fetch failed:", err)
        }

        setSuggestions(merged.slice(0, 30))
      }, 300),
      [uniqueTokensFromTx]
    )

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setInputValue(value)

      if (value.trim() && !isComposing) {
        debouncedSetSuggestions(value.trim())
        setShowSuggestions(true)
        setShowRecent(false)
      } else if (!value.trim()) {
        setShowSuggestions(false)
        setShowRecent(true)
      } else {
        setShowSuggestions(false)
        setShowRecent(false)
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
      if (simpleDesign) {
        addRecent({
          type: "token",
          label: suggestion.label,
          symbol: suggestion.symbol,
          name: suggestion.name,
          address: suggestion.address,
          imageUrl: suggestion.imageUrl,
        })
        const searchValue = suggestion.address || suggestion.label
        onSearch({
          searchQuery: searchValue,
          searchType: "coin",
          tokens: [{ value: searchValue, type: "coin" }],
          displayQuery: suggestion.label,
        })
        setInputValue("")
        setShowSuggestions(false)
        setShowRecent(false)
        return
      }
      addToken(suggestion.label, suggestion)
    }

    // Handle input focus
    const handleInputFocus = () => {
      if (!inputValue.trim() && recent.length > 0) {
        setShowRecent(true)
      }
    }

    // Handle input blur
    const handleInputBlur = () => {
      setTimeout(() => {
        setShowRecent(false)
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
          setShowRecent(false)
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

    // Original design: single input + search button + dropdown
    if (simpleDesign) {
      const showDropdown = showRecent || (showSuggestions && suggestions.length > 0)
      return (
        <div ref={containerRef} className={`relative ${className}`}>
          <form
            className="custom-frm-bx mb-0"
            onSubmit={(e) => {
              e.preventDefault()
              if (inputValue.trim()) {
                onSearch({
                  searchQuery: inputValue.trim(),
                  searchType: "coin",
                  tokens: [{ value: inputValue.trim(), type: "coin" }],
                  displayQuery: inputValue.trim(),
                })
                setInputValue("")
                setShowSuggestions(false)
                setShowRecent(false)
              }
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="form-control pe-5"
              placeholder={placeholder}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
            />
            <div className="searching-bx">
              <button className="search-btn" type="submit">
                <FontAwesomeIcon icon={faSearch} />
              </button>
              {inputValue && (
                <button
                  type="button"
                  className="clear-input-btn"
                  onClick={() => {
                    setInputValue("")
                    setShowSuggestions(false)
                    setShowRecent(false)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </form>

          {showDropdown && (
            <div className="dropdown-options">
              {showRecent && recent.length > 0 && (
                <>
                  <div className="dropdown-header all-data-clear d-flex justify-content-between align-items-center w-100 flex-nowrap" style={{ gap: "12px" }}>
                    <span className="text-muted small flex-shrink-0 text-nowrap">Recent searches</span>
                    <button
                      type="button"
                      className="quick-nw-btn flex-shrink-0"
                      onClick={(e) => {
                        e.preventDefault()
                        clearRecent()
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className="dropdown-scroll">
                    {recent.slice(0, 10).map((item) => (
                      <li
                        key={item.id}
                        className="dropdown-item d-flex align-items-start"
                        onClick={() => {
                          if (item.type === "token" && (item.address || item.label)) {
                            onSearch({
                              searchQuery: item.address || item.label,
                              searchType: "coin",
                              tokens: [{ value: item.address || item.label, type: "coin" }],
                              displayQuery: item.label,
                            })
                          }
                          setInputValue("")
                          setShowRecent(false)
                        }}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="dropdown-img" onError={(e) => { (e.target as HTMLImageElement).src = fallbackImage }} />
                        ) : (
                          <div className="dropdown-img d-flex align-items-center justify-content-center" style={{ width: "32px", height: "32px", background: "#1a1a1a", borderRadius: "50%", color: "#888" }}>
                            🪙
                          </div>
                        )}
                        <div className="dropdown-content flex-grow-1">
                          <h6 className="dropdown-title">{item.label}</h6>
                          <p className="dropdown-desc">
                            {item.symbol || (item.address ? `${item.address.slice(0, 6)}...${item.address.slice(-4)}` : "")}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {showSuggestions && suggestions.length > 0 && !showRecent && (
                <ul className="dropdown-scroll">
                  {suggestions.map((s, i) => (
                    <li
                      key={`${s.address}-${i}`}
                      className="dropdown-item d-flex align-items-start"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      <img src={s.imageUrl || fallbackImage} alt="" className="dropdown-img" onError={(e) => { (e.target as HTMLImageElement).src = fallbackImage }} />
                      <div className="dropdown-content flex-grow-1">
                        <h6 className="dropdown-title">{s.label}</h6>
                        <p className="dropdown-desc">{s.sublabel || (s.address ? `${s.address.slice(0, 6)}...${s.address.slice(-4)}` : "")}</p>
                        {s.address && (
                          <span className="dropdown-id">
                            <span className="cpy-title">CA:</span> {s.address.length > 20 ? `${s.address.slice(0, 8)}...${s.address.slice(-6)}` : s.address}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )
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

          {/* Recent searches (localStorage, max 10) */}
          {showRecent && recent.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              <div className="px-4 py-2 border-b border-[#2B2B2D] d-flex justify-content-between align-items-center flex-nowrap" style={{ gap: "12px", minWidth: 0 }}>
                <div className="d-flex align-items-center gap-2 text-gray-400 text-sm flex-shrink-0 min-w-0">
                  <Clock size={16} className="flex-shrink-0" />
                  <span className="text-nowrap">Recent searches</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearRecent()
                  }}
                  className="text-gray-400 hover:text-red-400 text-xs transition-all px-2 py-1 rounded hover:bg-red-400/10 cursor-pointer flex-shrink-0"
                  title="Clear all"
                >
                  Clear All
                </button>
              </div>
              {recent.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.type === "token" && (item.address || item.label)) {
                      const token: SearchToken = {
                        id: generateTokenId(),
                        value: item.address || item.label,
                        type: "coin",
                        label: item.label,
                        isValid: true,
                        imageUrl: item.imageUrl,
                        symbol: item.symbol,
                        name: item.name,
                        address: item.address,
                      }
                      setSearchTokens([token])
                      executeSearch([token])
                    } else {
                      addToken(item.label)
                    }
                    setShowRecent(false)
                  }}
                  className="w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 hover:bg-[#1A1A1A] text-white cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.label}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-[5px] border border-[#2B2B2D]"
                            style={{ objectFit: "cover" }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = fallbackImage
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center">
                            <span className="text-xs">🪙</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-white truncate">
                          {item.label}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {item.symbol ||
                            (item.address
                              ? `${item.address.slice(0, 6)}...${item.address.slice(-4)}`
                              : item.username || "")}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecent(item.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
                      title="Remove"
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
                    className={`w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 ${index === selectedIndex
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

      </div>
    )
  }
)

TokenizedSearchInput.displayName = "TokenizedSearchInput"

export default TokenizedSearchInput
