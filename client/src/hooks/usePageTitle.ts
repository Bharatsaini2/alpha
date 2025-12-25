import { useEffect } from "react"
import { useLocation } from "react-router-dom"

// Map of routes to their corresponding page titles
const pageTitleMap: Record<string, string> = {
  "/": "Alpha Stream - AlphaBlock AI",
  "/top-coins": "Top Coins - AlphaBlock AI",
  "/kol-feed": "KOL Feed - AlphaBlock AI",
  "/top-kol-coins": "Top KOL Coins - AlphaBlock AI",
  "/whales-leaderboard": "Whales Leaderboard - AlphaBlock AI",
  "/signal-engine": "Signal Engine - AlphaBlock AI",
}

// Function to extract base path from transaction routes
const getBasePath = (pathname: string): string => {
  if (pathname.startsWith("/transaction/")) {
    return "/transaction"
  }
  return pathname
}

// Function to get page title based on route
const getPageTitle = (pathname: string): string => {
  const basePath = getBasePath(pathname)

  // Check if we have a specific title for this route
  if (pageTitleMap[basePath]) {
    return pageTitleMap[basePath]
  }

  // For transaction detail pages, show a generic title
  if (basePath === "/transaction") {
    return "Transaction Details - AlphaBlock AI"
  }

  // Default fallback
  return "AlphaBlock AI"
}

export const usePageTitle = () => {
  const location = useLocation()

  useEffect(() => {
    const pageTitle = getPageTitle(location.pathname)
    document.title = pageTitle
  }, [location.pathname])
}
