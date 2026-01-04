import React, { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import LoginModal from "./LoginModal"
import OTPModal from "./OTPModal"

const AuthManager: React.FC = () => {
  const {
    showLoginModal,
    isAuthFlowActive,
    closeAuthModals,
    isAuthenticated,
    isLoading,
  } = useAuth()
  const [showOTP, setShowOTP] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")

  const handleOTPRequested = (email: string) => {
    setOtpEmail(email)
    setShowOTP(true)
  }

  const handleBackToLogin = () => {
    setShowOTP(false)
    setOtpEmail("")
  }

  const handleEmailChanged = (newEmail: string) => {
    setOtpEmail(newEmail)
  }

  const handleCloseAuth = () => {
    setShowOTP(false)
    setOtpEmail("")
    closeAuthModals()
  }

  // Show login modal only if explicitly in auth flow
  const shouldShowLogin = isAuthFlowActive && showLoginModal

  if (!shouldShowLogin && !showOTP) return null

  return (
    <>
      {/* Login Modal */}
      <LoginModal
        isOpen={shouldShowLogin && !showOTP}
        onClose={handleCloseAuth}
        onOTPRequested={handleOTPRequested}
      />

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTP}
        onClose={handleCloseAuth}
        email={otpEmail}
        onBackToLogin={handleBackToLogin}
        onEmailChanged={handleEmailChanged}
      />
    </>
  )
}

export default AuthManager
