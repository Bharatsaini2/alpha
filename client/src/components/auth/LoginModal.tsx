import React, { useState, useEffect } from "react"
import { Mail } from "lucide-react"
import { createPortal } from "react-dom"
import Phantom from "../../assets/phantom.svg"
import Google from "../../assets/google.svg"
import XIcon from "../../assets/twitter.svg"
import Telegram from "../../assets/telegram.png"
import { useAppKit, useAppKitAccount } from "@reown/appkit/react"
import { useAuth } from "../../contexts/AuthContext"
import axios from "axios"

const API_BASE = import.meta.env.VITE_SERVER_URL

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onOTPRequested: (email: string) => void
}

const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onOTPRequested,
}) => {
  const { open } = useAppKit()
  const { address, isConnected: walletConnected } = useAppKitAccount()
  const { login } = useAuth()

  const [formData, setFormData] = useState({
    email: "",
  })

  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [message, setMessage] = useState("")

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({ email: "" })
      setErrors({})
      setMessage("")
      setIsLoading(false)
    }
  }, [isOpen])

  // Handle wallet connection
  useEffect(() => {
    if (walletConnected && address && isOpen) {
      handleWalletLogin(address)
    }
  }, [walletConnected, address, isOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }))
    }
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    setMessage("")
    try {
      // Request OTP
      const response = await axios.post(`${API_BASE}/auth/request-otp`, {
        email: formData.email,
      })

      if (response.data.success) {
        setMessage(response.data.message)
        onOTPRequested(formData.email)
      } else {
        setErrors({ email: response.data.message })
      }
    } catch (error: any) {
      console.error("OTP request error:", error)
      setErrors({
        email:
          error.response?.data?.message ||
          "Failed to send OTP. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhantomLogin = () => {
    // Open Reown AppKit connect modal
    open({ view: "Connect" })
  }

  const handleWalletLogin = async (walletAddress: string) => {
    try {
      setIsLoading(true)
      setErrors({})

      // Request nonce from backend
      const nonceResponse = await axios.post(`${API_BASE}/auth/phantom/nonce`, {
        walletAddress,
      })

      if (nonceResponse.data.success) {
        const { message } = nonceResponse.data.data

        // Verify with backend (simplified for now)
        const verifyResponse = await axios.post(
          `${API_BASE}/auth/phantom/verify`,
          {
            walletAddress,
            signature: [], // Empty signature for now
            message,
          }
        )

        if (verifyResponse.data.success) {
          // Store tokens and redirect
          login(
            verifyResponse.data.data.user,
            verifyResponse.data.data.accessToken,
            verifyResponse.data.data.refreshToken
          )
          onClose()
        } else {
          setErrors({ phantom: verifyResponse.data.message })
        }
      }
    } catch (error: any) {
      console.error("Wallet login error:", error)
      setErrors({
        phantom:
          error.response?.data?.message ||
          "Failed to authenticate with wallet.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    setIsLoading(true)
    setErrors({})

    // Detect if we're on mobile
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )

    if (isMobile) {
      // On mobile, redirect in the same window instead of popup
      window.location.href = `${API_BASE}/auth/google`
      return
    }

    // Desktop: Use popup approach
    const popup = window.open(
      `${API_BASE}/auth/google`,
      "google-auth",
      "width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=100"
    )

    if (!popup) {
      setErrors({ google: "Popup blocked. Please allow popups for this site." })
      setIsLoading(false)
      return
    }

    const messageListener = (event: MessageEvent) => {
      // Filter out unrelated messages
      if (
        typeof event.data === "string" &&
        event.data.includes("setImmediate")
      ) {
        return
      }

      // Verify origin for security - allow both frontend and backend origins
      const allowedOrigins = [
        "http://localhost:9090",
        "http://localhost:5173",
        window.location.origin,
        "http://139.59.61.252",
        "http://139.59.61.252:9090",
        "https://app.alpha-block.ai",
        "https://api.alpha-block.ai",
      ]

      // Check if it's a Cloudflare tunnel URL
      const isCloudflareTunnel = event.origin.includes("trycloudflare.com")

      if (!allowedOrigins.includes(event.origin) && !isCloudflareTunnel) {
        return
      }

      // Only process OAuth messages
      if (
        !event.data ||
        typeof event.data !== "object" ||
        !event.data.hasOwnProperty("success")
      ) {
        return
      }

      if (event.data.success) {
        // Store tokens and redirect
        login(
          event.data.data.user,
          event.data.data.accessToken,
          event.data.data.refreshToken
        )
        onClose()
      } else {
        setErrors({
          google: event.data.error || "Google authentication failed",
        })
      }

      // Clean up
      window.removeEventListener("message", messageListener)
      setIsLoading(false)
    }

    window.addEventListener("message", messageListener)

    // Check if popup was closed manually
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener("message", messageListener)
        setIsLoading(false)
        setErrors({ google: "Authentication cancelled" })
      }
    }, 1000)
  }

  const handleTwitterLogin = () => {
    setIsLoading(true)
    setErrors({})

    // Detect if we're on mobile
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )

    if (isMobile) {
      // On mobile, redirect in the same window instead of popup
      window.location.href = `${API_BASE}/auth/twitter`
      return
    }

    // Desktop: Use popup approach
    const popup = window.open(
      `${API_BASE}/auth/twitter`,
      "twitter-auth",
      "width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=100"
    )

    if (!popup) {
      setErrors({
        twitter: "Popup blocked. Please allow popups for this site.",
      })
      setIsLoading(false)
      return
    }

    const messageListener = (event: MessageEvent) => {
      // Filter out unrelated messages
      if (
        typeof event.data === "string" &&
        event.data.includes("setImmediate")
      ) {
        return
      }

      // Enhanced origin validation for mobile and varied environments
      const allowedOrigins = [
        "http://localhost:9090",
        "http://localhost:5173",
        "https://localhost:9090",
        "https://localhost:5173",
        window.location.origin,
        "http://139.59.61.252",
        "http://139.59.61.252:9090",
        "https://app.alpha-block.ai",
        "https://api.alpha-block.ai",
      ]

      // Check if it's a Cloudflare tunnel URL or other development URLs
      const isCloudflareTunnel = event.origin.includes("trycloudflare.com")
      const isLocalhost = event.origin.includes("localhost")
      const isSameOrigin = event.origin === window.location.origin

      if (
        !allowedOrigins.includes(event.origin) &&
        !isCloudflareTunnel &&
        !isLocalhost &&
        !isSameOrigin
      ) {
        return
      }

      // Only process OAuth messages
      if (
        !event.data ||
        typeof event.data !== "object" ||
        !event.data.hasOwnProperty("success")
      ) {
        return
      }

      if (event.data.success) {
        // Store tokens and redirect
        login(
          event.data.data.user,
          event.data.data.accessToken,
          event.data.data.refreshToken
        )
        onClose()
      } else {
        setErrors({
          twitter: event.data.error || "Twitter authentication failed",
        })
      }

      // Clean up
      window.removeEventListener("message", messageListener)
      setIsLoading(false)
    }

    window.addEventListener("message", messageListener)

    // Check if popup was closed manually
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener("message", messageListener)
        setIsLoading(false)
        setErrors({ twitter: "Authentication cancelled" })
      }
    }, 1000)
  }

  const handleTelegramLogin = () => {
    // Placeholder as backend Telegram login is not yet implemented
    alert("Telegram Login coming soon!")
    console.log("Telegram Login requested")
  }

  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey)
      // Prevent body scrolling
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey)
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center overflow-y-auto z-[9000]">
      <style>{`
        .auth-container {
          width: 100%;
          max-width: 440px;
          padding: 2.5rem 1.5rem;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          border: 1px solid #1A1A1A;
          border-radius: 8px;
        }
        .social-btn {
          position: relative;
          width: 100%;
          background: #0D0D0D;
          color: white;
          font-weight: 500;
          padding: 0.85rem 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border: 1px solid #1A1A1A;
          transition: all 0.2s;
          text-transform: uppercase;
          font-size: 0.9rem;
          letter-spacing: 0.5px;
        }
        .social-btn:hover:not(:disabled) {
          background: #151515;
          border-color: #333333;
        }
        /* Corner Brackets */
        .corner {
          position: absolute;
          width: 6px;
          height: 6px;
          border-color: #444444;
          border-style: solid;
          pointer-events: none;
        }
        .corner-tl { top: -1px; left: -1px; border-width: 1px 0 0 1px; }
        .corner-tr { top: -1px; right: -1px; border-width: 1px 1px 0 0; }
        .corner-bl { bottom: -1px; left: -1px; border-width: 0 0 1px 1px; }
        .corner-br { bottom: -1px; right: -1px; border-width: 0 1px 1px 0; }

        .auth-input {
          background: #0D0D0D !important;
          border: 1px solid #1A1A1A !important;
          color: white !important;
          border-radius: 4px !important;
          text-transform: uppercase;
          font-size: 0.85rem;
          letter-spacing: 0.5px;
        }
        .auth-input::placeholder {
          color: #444444 !important;
        }
        .auth-label {
          color: #EBEBEB;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .continue-btn {
          background: #1D39D9;
          color: white;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-size: 0.9rem;
          padding: 0.75rem;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .continue-btn:hover:not(:disabled) {
          background: #162DB0;
        }
        .or-divider {
          display: flex;
          align-items: center;
          margin: 1.5rem 0;
          color: #333333;
          font-size: 0.75rem;
          letter-spacing: 1px;
        }
        .or-line {
          flex: 1;
          height: 1px;
          background: #1A1A1A;
        }
      `}</style>

      <div className="auth-container">
        {/* Logo */}
        <div className="mb-12 flex justify-center">
          <img src="/AppIcon.png" alt="Alpha" className="w-16 h-16 object-contain" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="auth-label block">EMAIL ADDRESS</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444444]" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`auth-input w-full pl-12 pr-4 py-3 outline-none transition-all ${errors.email ? "border-[#FF6B6B] border-opacity-50" : ""
                  }`}
                placeholder="YOUR EMAIL ADDRESS"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="continue-btn w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
            ) : (
              "CONTINUE"
            )}
          </button>
        </form>

        <div className="or-divider">
          <div className="or-line"></div>
          <span className="px-4">OR</span>
          <div className="or-line"></div>
        </div>

        <div className="space-y-4">
          {/* Phantom */}
          <button className="social-btn" onClick={handlePhantomLogin} disabled={isLoading}>
            <div className="corner corner-tl"></div>
            <div className="corner corner-tr"></div>
            <div className="corner corner-bl"></div>
            <div className="corner corner-br"></div>
            <img src={Phantom} alt="" className="w-5 h-5 opacity-90" />
            <span>LOG IN WITH PHANTOM</span>
          </button>

          {/* X */}
          <button className="social-btn" onClick={handleTwitterLogin} disabled={isLoading}>
            <div className="corner corner-tl"></div>
            <div className="corner corner-tr"></div>
            <div className="corner corner-bl"></div>
            <div className="corner corner-br"></div>
            <img src={XIcon} alt="" className="w-5 h-4 opacity-90" />
            <span>LOG IN WITH X</span>
          </button>

          {/* Telegram */}
          <button className="social-btn" onClick={handleTelegramLogin} disabled={isLoading}>
            <div className="corner corner-tl"></div>
            <div className="corner corner-tr"></div>
            <div className="corner corner-bl"></div>
            <div className="corner corner-br"></div>
            <img src={Telegram} alt="" className="w-5 h-5 opacity-90" />
            <span>LOG IN WITH TELEGRAM</span>
          </button>

          {/* Google */}
          <button className="social-btn" onClick={handleGoogleLogin} disabled={isLoading}>
            <div className="corner corner-tl"></div>
            <div className="corner corner-tr"></div>
            <div className="corner corner-bl"></div>
            <div className="corner corner-br"></div>
            <img src={Google} alt="" className="w-5 h-5 opacity-90" />
            <span>LOG IN WITH GOOGLE</span>
          </button>
        </div>

        {/* Error Messages */}
        <div className="mt-4 text-center">
          {errors.email && <p className="text-xs text-[#FF6B6B]">{errors.email}</p>}
          {message && <p className="text-xs text-[#05C96A]">{message}</p>}
          {errors.phantom && <p className="text-xs text-[#FF6B6B]">{errors.phantom}</p>}
          {errors.google && <p className="text-xs text-[#FF6B6B]">{errors.google}</p>}
          {errors.twitter && <p className="text-xs text-[#FF6B6B]">{errors.twitter}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default LoginModal
