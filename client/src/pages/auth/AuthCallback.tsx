import  { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import axios from "axios"

const API_BASE = import.meta.env.VITE_SERVER_URL

const AuthCallback = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  )
  const [error, setError] = useState("")

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const success = searchParams.get("success")
        const token = searchParams.get("token")
        const refresh = searchParams.get("refresh")
        const userId = searchParams.get("userId")

        if (success === "true" && token && refresh && userId) {
          // Fetch user data from backend
          try {
            const response = await axios.get(
              `${API_BASE}/auth/user/${userId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            )

            if (response.data.success) {
              // Store tokens and redirect
              login(response.data.data.user, token, refresh)
              setStatus("success")
              setTimeout(() => {
                navigate("/")
              }, 2000)
            } else {
              throw new Error("Failed to fetch user data")
            }
          } catch {
            throw new Error("Failed to fetch user data")
          }
        } else {
          throw new Error("Invalid callback parameters")
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Auth callback error"
        console.error("Auth callback error:", msg)
        setError(msg || "Authentication failed")
        setStatus("error")
        setTimeout(() => {
          navigate("/login")
        }, 3000)
      }
    }

    handleCallback()
  }, [searchParams, navigate, login])

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="bg-[#111113] border-[1px] border-gradient rounded-[20px] p-8 shadow-2xl max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <h2 className="text-white text-xl font-bold mb-2">
              Completing Authentication...
            </h2>
            <p className="text-gray-400">
              Please wait while we finish setting up your account.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-green-500 text-4xl mb-4">✅</div>
            <h2 className="text-white text-xl font-bold mb-2">
              Authentication Successful!
            </h2>
            <p className="text-gray-400">Redirecting you to the main page...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="text-red-500 text-4xl mb-4">❌</div>
            <h2 className="text-white text-xl font-bold mb-2">
              Authentication Failed
            </h2>
            <p className="text-gray-400 mb-4">{error}</p>
            <p className="text-sm text-gray-500">
              Redirecting you back to login...
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
