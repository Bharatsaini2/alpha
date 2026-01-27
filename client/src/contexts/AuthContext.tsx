import {
  createContext,
  useContext,
} from "react"


export const API_BASE =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

export interface User {
  id: string
  email?: string
  emailVerified?: boolean
  walletAddress?: string
  displayName?: string
  avatar?: string
  createdAt?: string
  lastLogin?: string
  telegramChatId?: string
  telegramUsername?: string
  telegramFirstName?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (userData: User, accessToken: string, refreshToken?: string) => void
  logout: () => void
  updateUser: (userData: Partial<User>) => void
  refreshUser: () => Promise<void>
  showLoginModal: boolean
  isAuthFlowActive: boolean
  openLoginModal: () => void
  openOTPModal: (email: string) => void
  closeAuthModals: () => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}


