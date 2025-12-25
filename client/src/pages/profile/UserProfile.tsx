import React, { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import {
  Mail,
  Wallet,
  User,
  Calendar,
  Shield,
  Link,
  LogOut,
} from "lucide-react"
import { ProtectedRoute } from "../../components/common/ProtectedRoute"

const UserProfile: React.FC = () => {
  const { user, logout, updateUser } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    displayName: user?.displayName || "",
  })

  const handleSave = () => {
    updateUser(editData)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditData({
      displayName: user?.displayName || "",
    })
    setIsEditing(false)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getAuthMethodIcon = (authType: string) => {
    switch (authType) {
      case "email":
        return <Mail className="w-4 h-4" />
      case "phantom":
        return <Wallet className="w-4 h-4" />
      case "google":
        return <Shield className="w-4 h-4" />
      case "twitter":
        return <User className="w-4 h-4" />
      default:
        return <User className="w-4 h-4" />
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#000000] py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="bg-[#1a1a1a] rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt="Profile"
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {user?.displayName || "Anonymous User"}
                  </h1>
                  <p className="text-gray-400">{user?.email || "No email"}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profile Information */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Profile Information
                </h2>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {isEditing ? "Cancel" : "Edit"}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Display Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.displayName}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          displayName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-[#2a2a2a] border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                  ) : (
                    <p className="text-white">
                      {user?.displayName || "Not set"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email
                  </label>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <p className="text-white">
                      {user?.email || "Not provided"}
                    </p>
                    {user?.emailVerified && (
                      <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded-full">
                        Verified
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Wallet Address
                  </label>
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-gray-400" />
                    <p className="text-white font-mono text-sm">
                      {user?.walletAddress || "Not connected"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Last Login
                  </label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <p className="text-white">{formatDate(user?.lastLogin)}</p>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Connected Accounts */}
            <div className="bg-[#1a1a1a] rounded-lg p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Link className="w-5 h-5 text-white" />
                <h2 className="text-xl font-semibold text-white">
                  Connected Accounts
                </h2>
              </div>

              <div className="space-y-3">
                {/* Email Account */}
                {user?.email && (
                  <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getAuthMethodIcon("email")}
                      <div>
                        <p className="text-white font-medium">Email</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded-full">
                      Primary
                    </span>
                  </div>
                )}

                {/* Wallet Account */}
                {user?.walletAddress && (
                  <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getAuthMethodIcon("phantom")}
                      <div>
                        <p className="text-white font-medium">Phantom Wallet</p>
                        <p className="text-gray-400 text-sm font-mono">
                          {user.walletAddress.slice(0, 8)}...
                          {user.walletAddress.slice(-8)}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-blue-600 text-blue-100 text-xs rounded-full">
                      Connected
                    </span>
                  </div>
                )}

                {/* Placeholder for other connected accounts */}
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">
                    Connect more accounts for easier access
                  </p>
                  <div className="flex justify-center space-x-4">
                    <button className="flex items-center space-x-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-lg transition-colors">
                      <Shield className="w-4 h-4" />
                      <span>Google</span>
                    </button>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white rounded-lg transition-colors">
                      <User className="w-4 h-4" />
                      <span>Twitter</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}

export default UserProfile
