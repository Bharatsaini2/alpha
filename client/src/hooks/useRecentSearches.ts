import { useState, useCallback, useEffect } from "react"

const MAX_RECENT = 10
const KEY_ALPHA = "recentSearches_alpha"
const KEY_KOL = "recentSearches_kol"

export type RecentItemType = "token" | "kol"

export interface RecentSearchItem {
  id: string
  type: RecentItemType
  label: string
  symbol?: string
  name?: string
  address?: string
  imageUrl?: string
  username?: string
  walletAddress?: string
  lastUsed: string
}

function getStorageKey(page: "alpha" | "kol"): string {
  return page === "kol" ? KEY_KOL : KEY_ALPHA
}

function loadRecent(page: "alpha" | "kol"): RecentSearchItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(page))
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentSearchItem[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecent(page: "alpha" | "kol", items: RecentSearchItem[]) {
  try {
    localStorage.setItem(
      getStorageKey(page),
      JSON.stringify(items.slice(0, MAX_RECENT))
    )
  } catch {
    // ignore
  }
}

export interface AddRecentTokenParams {
  type: "token"
  label: string
  symbol?: string
  name?: string
  address?: string
  imageUrl?: string
}

export interface AddRecentKolParams {
  type: "kol"
  label: string
  username: string
  imageUrl?: string
  walletAddress?: string
}

export type AddRecentParams = AddRecentTokenParams | AddRecentKolParams

export function useRecentSearches(page: "alpha" | "kol") {
  const [recent, setRecent] = useState<RecentSearchItem[]>(() =>
    loadRecent(page)
  )

  useEffect(() => {
    setRecent(loadRecent(page))
  }, [page])

  const addRecent = useCallback(
    (params: AddRecentParams) => {
      const lastUsed = new Date().toISOString()
      const id = `recent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      if (params.type === "token") {
        const key = (params.address || params.label || id).toLowerCase()
        setRecent((prev) => {
          const without = prev.filter(
            (item) =>
              item.type !== "token" ||
              (item.address?.toLowerCase() !== key &&
                (item.address || item.label)?.toLowerCase() !== key)
          )
          const newItem: RecentSearchItem = {
            id,
            type: "token",
            label: params.label,
            symbol: params.symbol,
            name: params.name,
            address: params.address,
            imageUrl: params.imageUrl,
            lastUsed,
          }
          const next = [newItem, ...without].slice(0, MAX_RECENT)
          saveRecent(page, next)
          return next
        })
      } else {
        const key = (params.username || params.label).toLowerCase()
        setRecent((prev) => {
          const without = prev.filter(
            (item) =>
              item.type !== "kol" ||
              (item.username?.toLowerCase() !== key &&
                item.label?.toLowerCase() !== key)
          )
          const newItem: RecentSearchItem = {
            id,
            type: "kol",
            label: params.label,
            username: params.username,
            imageUrl: params.imageUrl,
            walletAddress: params.walletAddress,
            lastUsed,
          }
          const next = [newItem, ...without].slice(0, MAX_RECENT)
          saveRecent(page, next)
          return next
        })
      }
    },
    [page]
  )

  const clearRecent = useCallback(() => {
    setRecent([])
    saveRecent(page, [])
  }, [page])

  const removeRecent = useCallback(
    (id: string) => {
      setRecent((prev) => {
        const next = prev.filter((item) => item.id !== id)
        saveRecent(page, next)
        return next
      })
    },
    [page]
  )

  return { recent, addRecent, clearRecent, removeRecent }
}
