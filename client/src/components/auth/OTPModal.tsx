import React, { useState, useRef, useEffect } from "react"
import { ArrowLeft, Mail } from "lucide-react"
import { createPortal } from "react-dom"
import { useAuth } from "../../contexts/AuthContext"
import axios from "axios"

const API_BASE = import.meta.env.VITE_SERVER_URL

interface OTPModalProps {
  isOpen: boolean
  onClose: () => void
  email: string
  onBackToLogin: () => void
  onEmailChanged?: (newEmail: string) => void
}

const OTPModal: React.FC<OTPModalProps> = ({
  isOpen,
  onClose,
  email,
  onBackToLogin,
  onEmailChanged,
}) => {
  const [otp, setOtp] = useState<string[]>(new Array(6).fill(""))
  const [isLoading, setIsLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(59)
  const [canResend, setCanResend] = useState(false)
  const [error, setError] = useState("")
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [editedEmail, setEditedEmail] = useState(email)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const { login } = useAuth()

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setOtp(new Array(6).fill(""))
      setIsLoading(false)
      setTimeLeft(59)
      setCanResend(false)
      setError("")
      setIsEditingEmail(false)
      setEditedEmail(email)
      // Focus first input after a short delay
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [isOpen, email])

  // Sync editedEmail when email prop changes (but not if we're currently editing)
  useEffect(() => {
    if (!isEditingEmail && email !== editedEmail) {
      setEditedEmail(email)
    }
  }, [email, isEditingEmail, editedEmail])

  // Countdown timer
  useEffect(() => {
    if (timeLeft > 0 && isOpen) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [timeLeft, isOpen])

  const handleInputChange = (index: number, value: string) => {
    const numericValue = value.replace(/\D/g, "")
    if (numericValue.length > 1) return

    const newOtp = [...otp]
    newOtp[index] = numericValue
    setOtp(newOtp)

    if (numericValue && index < 5) {
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus()
      }, 0)
    }
  }

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
      } else if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      }
    }

    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "")

    if (pastedData.length === 6) {
      const newOtp = pastedData.split("")
      setOtp(newOtp)
      setTimeout(() => {
        inputRefs.current[5]?.focus()
      }, 100)
    } else if (pastedData.length > 0) {
      const newOtp = [...otp]
      for (let i = 0; i < Math.min(pastedData.length, 6); i++) {
        newOtp[i] = pastedData[i]
      }
      setOtp(newOtp)
      setTimeout(() => {
        const nextIndex = Math.min(pastedData.length, 5)
        inputRefs.current[nextIndex]?.focus()
      }, 100)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (otp.some((digit) => !digit)) {
      setError("Please enter all 6 digits")
      return
    }

    const emailToUse = editedEmail || email
    if (!emailToUse) {
      setError("Email not found")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const otpCode = otp.join("")
      const response = await axios.post(`${API_BASE}/auth/verify-otp`, {
        email: emailToUse,
        otpCode,
      })

      if (response.data.success) {
        login(
          response.data.data.user,
          response.data.data.accessToken,
          response.data.data.refreshToken
        )
        onClose()
      } else {
        setError(response.data.message)
      }
    } catch (error: any) {
      console.error("OTP verification error:", error)
      setError(
        error.response?.data?.message ||
        "Failed to verify OTP. Please try again."
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!email && !editedEmail) return

    setTimeLeft(59)
    setCanResend(false)
    setOtp(new Array(6).fill(""))
    setError("")
    inputRefs.current[0]?.focus()

    try {
      const response = await axios.post(`${API_BASE}/auth/request-otp`, {
        email: editedEmail || email,
      })

      if (!response.data.success) {
        setError(response.data.message)
      }
    } catch (error: any) {
      setError(
        error.response?.data?.message ||
        "Failed to resend OTP."
      )
    }
  }

  const handleEditEmail = () => {
    setIsEditingEmail(true)
    setError("")
  }

  const handleSaveEmail = async () => {
    const emailRegex = /\S+@\S+\.\S+/
    if (!editedEmail || !emailRegex.test(editedEmail)) {
      setError("Invalid email address")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await axios.post(`${API_BASE}/auth/request-otp`, {
        email: editedEmail,
      })

      if (response.data.success) {
        setIsEditingEmail(false)
        setOtp(new Array(6).fill(""))
        setTimeLeft(59)
        setCanResend(false)
        inputRefs.current[0]?.focus()
        if (onEmailChanged) {
          onEmailChanged(editedEmail)
        }
      } else {
        setError(response.data.message)
      }
    } catch (error: any) {
      setError(
        error.response?.data?.message ||
        "Failed to update email."
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedEmail(email)
    setIsEditingEmail(false)
    setError("")
  }

  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey)
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
          position: relative;
        }
        .back-btn {
          position: absolute;
          top: 1.5rem;
          left: 1.5rem;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666666;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          transition: color 0.2s;
          cursor: pointer;
        }
        .back-btn:hover {
          color: #999999;
        }
        .auth-label {
          color: #EBEBEB;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .email-display-box {
          background: #0D0D0D;
          border: 1px solid #1A1A1A;
          padding: 0.85rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 4px;
        }
        .otp-box {
          width: 54px;
          height: 54px;
          background: #0D0D0D;
          border: 1px solid #1A1A1A;
          border-radius: 4px;
          text-align: center;
          color: white;
          font-size: 1.5rem;
          font-weight: 600;
          focus: outline-none;
          transition: border-color 0.2s;
        }
        .otp-box:focus {
          border-color: #333333;
          outline: none;
        }
        .continue-btn {
          position: relative;
          background: #1D39D9;
          color: white!important;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-size: 0.9rem;
          padding: 0.85rem;
          border-radius: 4px;
          transition: background 0.2s;
          width: 100%;
          border: none;
        }
        .continue-btn:hover:not(:disabled) {
          background: #162DB0;
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
        
        .resend-timer {
          color: #444444;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          text-align: center;
          letter-spacing: 1px;
        }
        .resend-link {
          color: #3b82f6;
          cursor: pointer;
        }
        .resend-link:hover {
          color: #60a5fa;
        }
      `}</style>

      <div className="auth-container">
        {/* Back Button */}
        <div className="back-btn" onClick={onBackToLogin}>
          <ArrowLeft size={16} /> BACK
        </div>

        {/* Logo */}
        <div className="mb-8 flex justify-center mt-4">
          <img src="/AppIcon.png" alt="Alpha" className="w-16 h-16 object-contain" />
        </div>

        <div className="text-white text-base font-bold text-center tracking-[2px] uppercase mb-10">
          Verification Code
        </div>

        <div className="space-y-8">
          {/* Email Section */}
          <div className="space-y-3">
            <div className="auth-label">Email Address</div>
            {!isEditingEmail ? (
              <div className="email-display-box">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail size={18} className="text-[#444444]" />
                  <span className="text-white text-sm font-medium uppercase truncate">
                    {editedEmail || email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleEditEmail}
                  className="text-[#EBEBEB] text-[0.65rem] font-bold uppercase tracking-wider ml-4 cursor-pointer"
                >
                  EDIT
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={editedEmail}
                  onChange={(e) => setEditedEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0D0D0D] border border-[#1A1A1A] rounded text-white text-sm focus:outline-none focus:border-[#333333]"
                  placeholder="ENTER NEW EMAIL"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEmail}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-[#1D39D9] text-white text-xs font-bold uppercase rounded cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold uppercase rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* OTP Section */}
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex justify-between gap-1">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el
                    return undefined
                  }}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  autoComplete="one-time-code"
                  className="otp-box"
                />
              ))}
            </div>

            {error && (
              <div className="text-center">
                <p className="text-xs text-[#FF4444] uppercase font-bold tracking-wider">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || otp.some((digit) => !digit)}
              className="continue-btn"
            >
              <div className="corner corner-tl"></div>
              <div className="corner corner-tr"></div>
              <div className="corner corner-bl"></div>
              <div className="corner corner-br"></div>
              {isLoading ? "Verifying..." : "Enter OTP"}
            </button>
          </form>

          {/* Resend Timer */}
          <div className="resend-timer mt-4">
            {canResend ? (
              <span className="resend-link" onClick={handleResendCode}>
                RESEND CODE
              </span>
            ) : (
              <span>
                RESEND CODE IN : {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:
                {String(timeLeft % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default OTPModal
