import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Phantom from "../../assets/phantom.svg"
import { useAppKit, useAppKitAccount } from "@reown/appkit/react"
import { useAuth } from "../../contexts/AuthContext"
import axios from "axios"

const API_BASE = import.meta.env.VITE_SERVER_URL

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { open } = useAppKit()
  const { address, isConnected: walletConnected } = useAppKitAccount()
  const { login, refreshUser } = useAuth()

  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [message, setMessage] = useState("")
  const loginInProgressRef = useRef(false)
  const processedAddressRef = useRef<string | null>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrors({})
      setMessage("")
      setIsLoading(false)
      loginInProgressRef.current = false
      processedAddressRef.current = null
    }
  }, [isOpen])

  // Handle wallet connection
  useEffect(() => {
    if (walletConnected && address && isOpen && !loginInProgressRef.current && processedAddressRef.current !== address) {
      handleWalletLogin(address)
    }
  }, [walletConnected, address, isOpen])



  const handlePhantomLogin = () => {
    // Open Reown AppKit connect modal
    open({ view: "Connect" })
  }

  const handleWalletLogin = async (walletAddress: string) => {
    // Prevent duplicate login attempts
    if (loginInProgressRef.current || processedAddressRef.current === walletAddress) {
      console.log("Login already in progress or address already processed, skipping...")
      return
    }

    try {
      loginInProgressRef.current = true
      processedAddressRef.current = walletAddress
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
          
          // Refresh user data to get latest Telegram connection status
          try {
            await refreshUser()
          } catch (refreshError) {
            console.error("Failed to refresh user data after login:", refreshError)
            // Don't block login flow, user can manually refresh page
            setMessage("Login successful! Please refresh page to see latest connection status.")
          }
          
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
      loginInProgressRef.current = false
    }
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(

    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center overflow-y-auto z-[9000]"
      onClick={handleBackdropClick}
    >
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
        </div>

        {/* Error Messages */}
        <div className="mt-4 text-center">
          {message && <p className="text-xs text-[#05C96A]">{message}</p>}
          {errors.phantom && <p className="text-xs text-[#FF6B6B]">{errors.phantom}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default LoginModal
