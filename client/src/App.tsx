import "./App.css"
import { BrowserRouter as Router } from "react-router-dom"
import AppRoutes from "./routes/routes.tsx"
import { AuthProvider } from "./contexts/AuthContext"
import { createAppKit } from "@reown/appkit/react"
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react"
import { solana } from "@reown/appkit/networks"
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets"
import { useEffect } from "react"

function App() {
  const solanaWeb3JsAdapter = new SolanaAdapter({
    wallets: [new PhantomWalletAdapter() as any],
  })

  const metadata = {
    name: "AlphaBlock AI",
    description: "AlphaBlock AI",
    url: window.location.origin,
    icons: [`${window.location.origin}/AppIcon.png`],
  }

  const projectId =
    import.meta.env.VITE_API_REOWNKIT_PROJECTID ||
    "56ac91b8fcdfa488c51f6b87a374ce59"

  createAppKit({
    adapters: [solanaWeb3JsAdapter],
    networks: [solana],
    allWallets: "HIDE",
    metadata,
    projectId,
    themeVariables: {
      "--w3m-accent": "#A259FF",
    },
    featuredWalletIds: [
      "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393",
    ],
    enableWalletConnect: false,
    features: {
      analytics: true,
      socials: false,
      email: false,
    },
  })
  const isIOS = () => {
    const ua = navigator.userAgent || ""
    const isTouchMac = ua.includes("Mac") && "ontouchend" in document
    return /iPad|iPhone|iPod/.test(ua) || isTouchMac
  }
  if (isIOS()) document.documentElement.classList.add("ios-safari")

  useEffect(() => {
    const preventZoom = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "0")
      ) {
        e.preventDefault()
      }
    }

    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
      }
    }

    document.addEventListener("keydown", preventZoom)
    document.addEventListener("wheel", preventWheelZoom, { passive: false })

    return () => {
      document.removeEventListener("keydown", preventZoom)
      document.removeEventListener("wheel", preventWheelZoom)
    }
  }, [])

  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App
