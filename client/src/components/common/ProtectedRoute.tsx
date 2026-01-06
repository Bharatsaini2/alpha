import React from "react"
import { useAuth } from "../../contexts/AuthContext"
import Loader from "../../utils/Loader"

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth: _requireAuth = true,
}) => {
  const { isLoading } = useAuth()

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111113]">
        <Loader />
      </div>
    )
  }

  // Always render children - let the AuthManager handle showing modals when needed
  // When not authenticated, modals will overlay the content
  return <>{children}</>
}
