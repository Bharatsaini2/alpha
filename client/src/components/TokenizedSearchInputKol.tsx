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
import { useNavigate } from "react-router-dom"
import axios from "axios"
import fallbackImage from "../assets/default_token.svg"

const SUGGESTIONS_BASE_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"
import { useToast } from "../contexts/ToastContext"
import { useRecentSearches } from "../hooks/useRecentSearches"

interface SearchToken {
  id: string
  value: string
  type: "coin" | "kol" | "mixed"
  label: string
  isValid: boolean
  imageUrl?: string
  symbol?: string
  name?: string
  address?: string
  username?: string
}

interface Suggestion {
  type: "coin" | "kol" | "history"
  label: string
  sublabel?: string
  address?: string
  symbol?: string
  name?: string
  username?: string
  imageUrl?: string
  searchValue?: string
  frequency?: number
  lastUsed?: string
  page?: string
}

interface TokenizedSearchInputProps {
  onSearch: (searchData: {
    searchQuery: string
    searchType: "coin" | "kol" | "all"
    tokens: Array<{ value: string; type: string }>
    displayQuery?: string
  }) => void
  placeholder?: string
  className?: string
  page?: string // Page identifier for recent searches (e.g. "kol-feed")
  transactions?: any[] // Already loaded transactions for frontend-only suggestions
  /** When true, use original KOL page design: single input + search btn + dropdown (no token chips) */
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

const TokenizedSearchInputKol = React.forwardRef<
  TokenizedSearchInputHandle,
  TokenizedSearchInputProps
>(
  (
    {
      onSearch,
      placeholder = "Search tokens, contract address, or KOL username...",
      className = "",
      page = "kol-feed",
      transactions = [],
      simpleDesign = false,
    },
    ref
  ) => {
    const [inputValue, setInputValue] = useState("")
    const [searchTokens, setSearchTokens] = useState<SearchToken[]>([])
    const [tokenSuggestions, setTokenSuggestions] = useState<Suggestion[]>([])
    const [kolSuggestions, setKolSuggestions] = useState<Suggestion[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const [isComposing, setIsComposing] = useState(false)
    const [showRecent, setShowRecent] = useState(false)
    const { showToast } = useToast()
    const navigate = useNavigate()

    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const { recent, addRecent, clearRecent, removeRecent } =
      useRecentSearches("kol")

    // Unique tokens and KOLs from transactions (frontend-only)
    const { uniqueTokens, uniqueKols } = useMemo(() => {
      const tokenMap = new Map<string, Suggestion>()
      const kolMap = new Map<string, Suggestion>()
      for (const tx of transactions) {
        const tokenIn = tx.transaction?.tokenIn
        const tokenOut = tx.transaction?.tokenOut
        if (tokenIn && tx.tokenInAddress) {
          const key = (tx.tokenInAddress || "").toLowerCase()
          if (!tokenMap.has(key)) {
            tokenMap.set(key, {
              type: "coin",
              label: tokenIn.symbol ?? tx.tokenInSymbol ?? tokenIn.name ?? tx.tokenInAddress,
              sublabel: tokenIn.name,
              address: tx.tokenInAddress,
              symbol: tokenIn.symbol ?? tx.tokenInSymbol,
              name: tokenIn.name,
              imageUrl: tx.inTokenURL,
            })
          }
        }
        if (tokenOut && tx.tokenOutAddress) {
          const key = (tx.tokenOutAddress || "").toLowerCase()
          if (!tokenMap.has(key)) {
            tokenMap.set(key, {
              type: "coin",
              label: tokenOut.symbol ?? tx.tokenOutSymbol ?? tokenOut.name ?? tx.tokenOutAddress,
              sublabel: tokenOut.name,
              address: tx.tokenOutAddress,
              symbol: tokenOut.symbol ?? tx.tokenOutSymbol,
              name: tokenOut.name,
              imageUrl: tx.outTokenURL,
            })
          }
        }
        const un = (tx.influencerUsername || tx.kolUsername || "").replace(/^@/, "")
        const addr = tx.whaleAddress || tx.kolAddress || tx.influencerAddress
        if (un && !kolMap.has(un.toLowerCase())) {
          kolMap.set(un.toLowerCase(), {
            type: "kol",
            label: tx.influencerName || tx.influencerUsername || un,
            sublabel: addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : undefined,
            username: un,
            address: addr,
            imageUrl: tx.influencerProfileImageUrl || tx.influencerImageUrl,
          })
        }
      }
      return {
        uniqueTokens: Array.from(tokenMap.values()),
        uniqueKols: Array.from(kolMap.values()),
      }
    }, [transactions])

    // Expose clear method to parent component
    useImperativeHandle(ref, () => ({
      clearAllTokens: () => {
        setSearchTokens([])
        setInputValue("")
        if (simpleDesign) {
          onSearch({
            searchQuery: "",
            searchType: "all",
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
    const detectTokenType = (value: string): "coin" | "kol" | "mixed" => {
      if (value.startsWith("0x") && value.length > 20) return "coin"
      if (value.length <= 10 && /^[A-Z0-9]+$/i.test(value)) return "coin"
      if (value.toLowerCase().startsWith("@")) return "kol"
      if (value.toLowerCase().includes("kol")) return "kol"
      return "mixed"
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
        type: type as "coin" | "kol" | "mixed",
        label: suggestion?.label || value || "",
        isValid: true,
        imageUrl: suggestion?.imageUrl || "",
        symbol: suggestion?.symbol || "",
        name: suggestion?.name || "",
        address: suggestion?.address || "",
        username: suggestion?.username || "",
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
        } else if (suggestion.type === "kol" && suggestion.username) {
          searchValue = suggestion.username
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

    // Clear all tokens
    const clearAllTokens = () => {
      setSearchTokens([])
      setInputValue("")
      executeSearch([])

      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 0)
    }

    // Execute search with current tokens
    const executeSearch = (tokens: SearchToken[]) => {
      const searchQuery = tokens.map((token) => token.value).join(", ")
      const hasCoins = tokens.some(
        (t) => t.type === "coin" || t.type === "mixed"
      )
      const hasKols = tokens.some((t) => t.type === "kol" || t.type === "mixed")

      let searchType: "coin" | "kol" | "all" = "all"
      if (hasCoins && !hasKols) searchType = "coin"
      else if (hasKols && !hasCoins) searchType = "kol"

      // Save to localStorage recent (max 10)
      if (searchQuery.trim() && searchType) {
        tokens.slice(0, 10).forEach((token) => {
          if (token.type === "kol" && token.username) {
            addRecent({
              type: "kol",
              label: token.label,
              username: token.username,
              imageUrl: token.imageUrl,
              walletAddress: token.address,
            })
          } else {
            addRecent({
              type: "token",
              label: token.label,
              symbol: token.symbol,
              name: token.name,
              address: token.address,
              imageUrl: token.imageUrl,
            })
          }
        })
      }

      const displayQuery = tokens.map((token) => token.label).join(", ")

      onSearch({
        searchQuery,
        searchType,
        tokens: tokens.map((t) => ({ value: t.value, type: t.type })),
        displayQuery,
      })
    }

    // Suggestions: frontend (loaded tx) + backend (all tokens/KOLs in DB), debounced 300ms
    const debouncedSetSuggestions = useCallback(
      debounce(async (query: string) => {
        const q = query.trim().replace(/^@/, "")
        if (q.length < 1) {
          setTokenSuggestions([])
          setKolSuggestions([])
          return
        }
        const qLower = q.toLowerCase()
        const isLikelyAddress =
          q.length >= 20 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q)

        // 1) Frontend: from loaded transactions
        const tokensFront = uniqueTokens.filter((s) => {
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
        const kolsFront = uniqueKols.filter((s) => {
          const username = (s.username || "").toLowerCase()
          const label = (s.label || "").toLowerCase()
          const sublabel = (s.sublabel || "").toLowerCase()
          return (
            username.includes(qLower) ||
            label.includes(qLower) ||
            sublabel.includes(qLower)
          )
        })

        const tokenSeen = new Set<string>()
        const kolSeen = new Set<string>()
        const tokensMerged: Suggestion[] = []
        const kolsMerged: Suggestion[] = []

        tokensFront.slice(0, 20).forEach((s) => {
          const key = (s.address || "").toLowerCase()
          if (key && !tokenSeen.has(key)) {
            tokenSeen.add(key)
            tokensMerged.push(s)
          }
        })
        kolsFront.slice(0, 15).forEach((s) => {
          const key = (s.username || s.label || "").toLowerCase()
          if (key && !kolSeen.has(key)) {
            kolSeen.add(key)
            kolsMerged.push(s)
          }
        })

        // 2) Backend: fetch more tokens + KOLs from influencer API
        try {
          const res = await axios.get(
            `${SUGGESTIONS_BASE_URL}/influencer/influencer-whale-transactions?search=${encodeURIComponent(q)}&limit=15&searchType=all`
          )
          const txs = res.data?.transactions || []
          txs.forEach((tx: any) => {
            const tokenIn = tx.transaction?.tokenIn
            const tokenOut = tx.transaction?.tokenOut
            const addToken = (addr: string, symbol: string, name: string, imageUrl: string) => {
              const key = (addr || "").toLowerCase()
              if (!key || tokenSeen.has(key)) return
              tokenSeen.add(key)
              tokensMerged.push({
                type: "coin",
                label: symbol || name || addr,
                sublabel: name,
                address: addr,
                symbol,
                name,
                imageUrl,
              })
            }
            if (tokenIn && tx.tokenInAddress) {
              addToken(
                tx.tokenInAddress,
                tokenIn.symbol ?? tx.tokenInSymbol,
                tokenIn.name,
                tx.inTokenURL || ""
              )
            }
            if (tokenOut && tx.tokenOutAddress) {
              addToken(
                tx.tokenOutAddress,
                tokenOut.symbol ?? tx.tokenOutSymbol,
                tokenOut.name,
                tx.outTokenURL || ""
              )
            }
            const un = (tx.influencerUsername || tx.kolUsername || "").replace(/^@/, "")
            if (un && !kolSeen.has(un.toLowerCase())) {
              kolSeen.add(un.toLowerCase())
              kolsMerged.push({
                type: "kol",
                label: tx.influencerName || tx.influencerUsername || un,
                sublabel: tx.whaleAddress ? `${(tx.whaleAddress || "").slice(0, 4)}...${(tx.whaleAddress || "").slice(-4)}` : undefined,
                username: un,
                address: tx.whaleAddress || tx.kolAddress,
                imageUrl: tx.influencerProfileImageUrl || tx.influencerImageUrl,
              })
            }
          })
        } catch (err) {
          console.error("KOL suggestions fetch failed:", err)
        }

        // Sort KOLs: exact username match first, then exact label match, then the rest
        const qTrimmed = q.toLowerCase().trim()
        const score = (s: Suggestion) => {
          const u = (s.username || "").toLowerCase().trim()
          const l = (s.label || "").toLowerCase().trim()
          if (u === qTrimmed) return 0
          if (l === qTrimmed) return 1
          return 2
        }
        const kolsSorted = [...kolsMerged].sort((a, b) => score(a) - score(b))

        setTokenSuggestions(tokensMerged.slice(0, 25))
        setKolSuggestions(kolsSorted.slice(0, 15))
      }, 300),
      [uniqueTokens, uniqueKols]
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

    const combinedSuggestions = useMemo(
      () => [...tokenSuggestions, ...kolSuggestions],
      [tokenSuggestions, kolSuggestions]
    )

    // KOL row click: filter feed to show their txns (same as token). Profile button goes to profile.
    const applyKolFilter = (suggestion: Suggestion) => {
      if (!suggestion.username) return
      addRecent({
        type: "kol",
        label: suggestion.label,
        username: suggestion.username,
        imageUrl: suggestion.imageUrl,
        walletAddress: suggestion.address,
      })
      onSearch({
        searchQuery: suggestion.username.replace(/^@/, ""),
        searchType: "kol",
        tokens: [{ value: suggestion.username.replace(/^@/, ""), type: "kol" }],
        displayQuery: suggestion.label,
      })
      setInputValue("")
      setShowSuggestions(false)
      setShowRecent(false)
      setSelectedIndex(-1)
    }

    const goToKolProfile = (username: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation()
      setShowSuggestions(false)
      setShowRecent(false)
      navigate(`/kol-feed-profile/${username.replace(/^@/, "")}`)
    }

    // Handle suggestion selection (token → add filter; KOL → add filter to show their txns)
    const handleSuggestionClick = (suggestion: Suggestion) => {
      if (suggestion.type === "kol" && suggestion.username) {
        applyKolFilter(suggestion)
        return
      }
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
        setSelectedIndex(-1)
        return
      }
      addToken(suggestion.label, suggestion)
    }

    // Handle key events
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (isComposing) return

      switch (e.key) {
        case "Enter": {
          e.preventDefault()
          if (
            showSuggestions &&
            selectedIndex >= 0 &&
            combinedSuggestions[selectedIndex]
          ) {
            const sel = combinedSuggestions[selectedIndex]
            if (sel.type === "kol" && sel.username) {
              applyKolFilter(sel)
            } else {
              addToken(sel.label, sel)
            }
          } else if (inputValue.trim()) {
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
          if (showSuggestions && combinedSuggestions.length > 0) {
            e.preventDefault()
            setSelectedIndex((prev) =>
              prev < combinedSuggestions.length - 1 ? prev + 1 : 0
            )
          }
          break

        case "ArrowUp":
          if (showSuggestions && combinedSuggestions.length > 0) {
            e.preventDefault()
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : combinedSuggestions.length - 1
            )
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
        case "kol":
          return "border border-white/70 bg-black"
        case "coin":
          return "border border-white/70 bg-black"
        default:
          return "border border-white/70 bg-black"
      }
    }

    // Original KOL page design: single input + search button + dropdown
    if (simpleDesign) {
      const showDropdown = showRecent || (showSuggestions && (tokenSuggestions.length > 0 || kolSuggestions.length > 0))
      return (
        <div ref={containerRef} className={`relative ${className}`}>
          <form
            className="custom-frm-bx mb-0"
            onSubmit={(e) => {
              e.preventDefault()
              if (inputValue.trim()) {
                onSearch({
                  searchQuery: inputValue.trim(),
                  searchType: "all",
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
                          if (item.type === "kol" && item.username) {
                            applyKolFilter({
                              type: "kol",
                              label: item.label,
                              username: item.username,
                              imageUrl: item.imageUrl,
                              address: item.walletAddress,
                            })
                            return
                          }
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
                            {item.type === "kol" ? "👤" : "🪙"}
                          </div>
                        )}
                        <div className="dropdown-content flex-grow-1">
                          <h6 className="dropdown-title">{item.label}</h6>
                          <p className="dropdown-desc">
                            {item.type === "kol" ? item.username : item.symbol || (item.address ? `${item.address.slice(0, 6)}...${item.address.slice(-4)}` : "")}
                          </p>
                        </div>
                        {item.type === "kol" && item.username && (
                          <button
                            type="button"
                            className="btn btn-sm ms-2 flex-shrink-0"
                            style={{ fontSize: "11px", padding: "4px 8px", background: "#2B2B2D", color: "#fff", border: "1px solid #3D3D3D", borderRadius: 0 }}
                            onClick={(e) => goToKolProfile(item.username!, e)}
                          >
                            Profile
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {showSuggestions && (tokenSuggestions.length > 0 || kolSuggestions.length > 0) && !showRecent && (
                <>
                  {tokenSuggestions.length > 0 && (
                    <>
                      <div className="dropdown-header text-muted small px-3 py-1">Tokens</div>
                      <ul className="dropdown-scroll">
                        {tokenSuggestions.map((s, i) => (
                          <li
                            key={`t-${s.address}-${i}`}
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
                    </>
                  )}
                  {kolSuggestions.length > 0 && (
                    <>
                      <div className="dropdown-header text-muted small px-3 py-1">KOL Users</div>
                      <ul className="dropdown-scroll">
                        {kolSuggestions.map((s, j) => (
                          <li
                            key={`k-${s.username}-${j}`}
                            className="dropdown-item d-flex align-items-center"
                            onClick={() => handleSuggestionClick(s)}
                          >
                            <img src={s.imageUrl || fallbackImage} alt="" className="dropdown-img" style={{ borderRadius: "50%" }} onError={(e) => { (e.target as HTMLImageElement).src = fallbackImage }} />
                            <div className="dropdown-content flex-grow-1 min-w-0">
                              <h6 className="dropdown-title">{s.label}</h6>
                              <p className="dropdown-desc">@{s.username}</p>
                              {s.sublabel && <span className="dropdown-id">{s.sublabel}</span>}
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm flex-shrink-0 ms-2"
                              style={{ fontSize: "11px", padding: "4px 8px", background: "#2B2B2D", color: "#fff", border: "1px solid #3D3D3D", borderRadius: 0 }}
                              onClick={(e) => goToKolProfile(s.username!, e)}
                            >
                              Profile
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
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
                    className="w-4 h-4 md rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = fallbackImage
                    }}
                  />
                  <span className="max-w-[120px] truncate">{token.label}</span>
                  <button
                    onClick={() => removeToken(token.id)}
                    className="ml-1 hover:bg-white/20 rounded-[5px] p-0.5 transition-all"
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
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (item.type === "kol" && item.username) {
                      applyKolFilter({
                        type: "kol",
                        label: item.label,
                        username: item.username,
                        imageUrl: item.imageUrl,
                        address: item.walletAddress,
                      })
                      return
                    }
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      if (item.type === "kol" && item.username) {
                        applyKolFilter({
                          type: "kol",
                          label: item.label,
                          username: item.username,
                          imageUrl: item.imageUrl,
                          address: item.walletAddress,
                        })
                      }
                    }
                  }}
                  className="w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 hover:bg-[#1A1A1A] text-white cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
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
                          <span className="text-xs">
                            {item.type === "kol" ? "👤" : "🪙"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-white truncate">
                        {item.label}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {item.type === "kol"
                          ? item.username
                          : item.symbol ||
                            (item.address
                              ? `${item.address.slice(0, 6)}...${item.address.slice(-4)}`
                              : "")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.type === "kol" && item.username && (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-none border border-[#3D3D3D] bg-[#2B2B2D] text-white hover:bg-[#3D3D3D] transition-all"
                        onClick={(e) => {
                          e.stopPropagation()
                          goToKolProfile(item.username!, e)
                        }}
                      >
                        Profile
                      </button>
                    )}
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
                </div>
              ))}
            </div>
          )}

          {/* Suggestions dropdown: Tokens + KOL Users */}
          {showSuggestions &&
            (tokenSuggestions.length > 0 || kolSuggestions.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#000000] border border-[#2B2B2D] rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="px-4 py-2 border-b border-[#2B2B2D] text-gray-400 text-xs font-medium uppercase tracking-wider">
                  Search Results
                </div>
                {tokenSuggestions.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 text-gray-500 text-xs font-medium uppercase">
                      Tokens
                    </div>
                    {tokenSuggestions.map((suggestion, i) => {
                      const globalIndex = i
                      return (
                        <button
                          key={`token-${suggestion.address}-${i}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className={`w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] ${globalIndex === selectedIndex ? "bg-[#1A1A1A]" : ""} hover:bg-[#1A1A1A] text-white cursor-pointer`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {suggestion.imageUrl ? (
                                <img
                                  src={suggestion.imageUrl}
                                  alt={suggestion.label}
                                  className="w-8 h-8 rounded-[5px] border border-[#2B2B2D]"
                                  style={{ objectFit: "cover" }}
                                  onError={(e) => {
                                    const t = e.target as HTMLImageElement
                                    t.src = fallbackImage
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center text-xs">
                                  🪙
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-white truncate">
                                {suggestion.label}
                              </div>
                              {suggestion.sublabel && (
                                <div className="text-gray-400 text-xs truncate">
                                  {suggestion.sublabel}
                                </div>
                              )}
                              {suggestion.address && (
                                <div className="text-gray-500 text-xs font-mono truncate flex items-center gap-1">
                                  {suggestion.address.length > 20
                                    ? `${suggestion.address.slice(0, 6)}...${suggestion.address.slice(-4)}`
                                    : suggestion.address}
                                  <Copy
                                    className="w-3 h-3"
                                    onClick={(ev) => {
                                      ev.stopPropagation()
                                      handleCopyTokenAddress(
                                        suggestion.address || "",
                                        ""
                                      )
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
                {kolSuggestions.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 text-gray-500 text-xs font-medium uppercase">
                      KOL Users
                    </div>
                    {kolSuggestions.map((suggestion, j) => {
                      const globalIndex = tokenSuggestions.length + j
                      return (
                        <div
                          key={`kol-${suggestion.username}-${j}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSuggestionClick(suggestion)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              handleSuggestionClick(suggestion)
                            }
                          }}
                          className={`w-full px-4 py-3 text-left transition-all border-b border-[#2B2B2D] last:border-b-0 ${globalIndex === selectedIndex ? "bg-[#1A1A1A]" : ""} hover:bg-[#1A1A1A] text-white cursor-pointer flex items-center justify-between`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="flex-shrink-0">
                              {suggestion.imageUrl ? (
                                <img
                                  src={suggestion.imageUrl}
                                  alt={suggestion.label}
                                  className="w-8 h-8 rounded-full border border-[#2B2B2D]"
                                  style={{ objectFit: "cover" }}
                                  onError={(e) => {
                                    const t = e.target as HTMLImageElement
                                    t.src = fallbackImage
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full border border-[#2B2B2D] bg-[#1A1A1A] flex items-center justify-center text-xs">
                                  👤
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-white truncate">
                                {suggestion.label}
                              </div>
                              {suggestion.username && (
                                <div className="text-gray-400 text-xs truncate">
                                  @{suggestion.username}
                                </div>
                              )}
                              {suggestion.sublabel && (
                                <div className="text-gray-500 text-xs truncate">
                                  {suggestion.sublabel}
                                </div>
                              )}
                            </div>
                          </div>
                          {suggestion.username && (
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded-none border border-[#3D3D3D] bg-[#2B2B2D] text-white hover:bg-[#3D3D3D] transition-all flex-shrink-0 ml-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                goToKolProfile(suggestion.username!, e)
                              }}
                            >
                              Profile
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
        </div>
      </div>
    )
  }
)

TokenizedSearchInputKol.displayName = "TokenizedSearchInputKol"

export default TokenizedSearchInputKol
