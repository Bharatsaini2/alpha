import React, { useState, useEffect, ReactNode } from "react"
import axios from "axios"
import { AuthContext, User, API_BASE } from "./AuthContext"

interface AuthProviderProps {
    children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [isAuthFlowActive, setIsAuthFlowActive] = useState(false)

    const isAuthenticated = !!user

    const attemptTokenRefresh = async () => {
        try {
            const refreshToken = localStorage.getItem("refreshToken")
            if (!refreshToken) {
                logout()
                return
            }

            // Send refresh request with credentials to include cookies
            const response = await axios.post(
                `${API_BASE}/auth/refresh`,
                {},
                {
                    withCredentials: true,
                }
            )

            if (response.data.success) {
                const {
                    accessToken,
                    refreshToken: newRefreshToken,
                    user,
                } = response.data.data
                setUser(user)
                localStorage.setItem("user", JSON.stringify(user))
                localStorage.setItem("accessToken", accessToken)
                if (newRefreshToken) {
                    localStorage.setItem("refreshToken", newRefreshToken)
                }
            } else {
                logout()
            }
        } catch (error) {
            console.error("Token refresh error:", error)
            logout()
        }
    }

    // Initialize auth state from localStorage
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const storedUser = localStorage.getItem("user")
                const accessToken = localStorage.getItem("accessToken")
                const refreshToken = localStorage.getItem("refreshToken")

                if (storedUser && accessToken) {
                    const userData = JSON.parse(storedUser)
                    setUser(userData)

                    // Verify token is still valid by fetching current user
                    try {
                        const response = await axios.get(`${API_BASE}/auth/me`, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                            withCredentials: true,
                        })

                        if (response.data.success) {
                            setUser(response.data.data.user)
                            localStorage.setItem(
                                "user",
                                JSON.stringify(response.data.data.user)
                            )
                        } else {
                            // Token is invalid, try to refresh
                            if (refreshToken) {
                                await attemptTokenRefresh()
                            } else {
                                logout()
                            }
                        }
                    } catch {
                        // Token is invalid, try to refresh
                        if (refreshToken) {
                            await attemptTokenRefresh()
                        } else {
                            logout()
                        }
                    }
                } else if (refreshToken) {
                    // Only refresh token available, try to refresh
                    await attemptTokenRefresh()
                }
            } catch (error) {
                console.error("Auth initialization error:", error)
                logout()
            } finally {
                setIsLoading(false)
            }
        }

        initializeAuth()
    }, [])

    const login = (
        userData: User,
        accessToken: string,
        refreshToken?: string
    ) => {
        setUser(userData)
        localStorage.setItem("user", JSON.stringify(userData))
        localStorage.setItem("accessToken", accessToken)
        if (refreshToken) {
            localStorage.setItem("refreshToken", refreshToken)
        }
    }

    const logout = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken")
            if (accessToken) {
                // Call logout endpoint to invalidate server-side session
                await axios.post(
                    `${API_BASE}/auth/logout`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                )
            }
        } catch (error) {
            console.error("Logout error:", error)
        } finally {
            // Clear local state regardless of server response
            setUser(null)
            localStorage.removeItem("user")
            localStorage.removeItem("accessToken")
            localStorage.removeItem("refreshToken")
        }
    }

    const updateUser = (userData: Partial<User>) => {
        if (user) {
            const updatedUser = { ...user, ...userData }
            setUser(updatedUser)
            localStorage.setItem("user", JSON.stringify(updatedUser))
        }
    }

    const refreshUser = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken")
            if (accessToken) {
                const response = await axios.get(`${API_BASE}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })

                if (response.data.success) {
                    setUser(response.data.data.user)
                    localStorage.setItem("user", JSON.stringify(response.data.data.user))
                }
            }
        } catch (error) {
            console.error("Refresh user error:", error)
            // Try to refresh token if access token is invalid
            await attemptTokenRefresh()
        }
    }

    const openLoginModal = () => {
        setShowLoginModal(true)
        setIsAuthFlowActive(true)
    }

    const openOTPModal = (_email: string) => {
        setShowLoginModal(false)
        // OTP modal will be handled by the AuthManager component
    }

    const closeAuthModals = () => {
        setShowLoginModal(false)
        setIsAuthFlowActive(false)
    }

    const value = {
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUser,
        refreshUser,
        showLoginModal,
        isAuthFlowActive,
        openLoginModal,
        openOTPModal,
        closeAuthModals,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
