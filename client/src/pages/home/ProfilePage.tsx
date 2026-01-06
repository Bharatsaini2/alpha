import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi"
import { useAuth } from "../../contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import api from "../../lib/api"
import { useToast } from "../../components/ui/Toast"
import { useState } from "react"

function ProfilePage() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [disconnecting, setDisconnecting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const handleDisconnectClick = () => {
    setShowConfirmDialog(true)
  }

  const handleConfirmDisconnect = async () => {
    try {
      setDisconnecting(true)
      setShowConfirmDialog(false)
      const response = await api.post('/alerts/unlink-telegram')
      
      if (response.data.success) {
        const alertsDeleted = response.data.data?.alertsDeleted || 0
        // Update user context to remove Telegram data
        updateUser({
          telegramChatId: undefined,
          telegramUsername: undefined,
          telegramFirstName: undefined,
        })
        showToast(
          `Telegram disconnected successfully. ${alertsDeleted} alert(s) deleted.`,
          'success'
        )
      } else {
        showToast('Failed to disconnect Telegram account', 'error')
      }
    } catch (err: any) {
      console.error('Error disconnecting Telegram:', err)
      showToast(err.response?.data?.message || 'Failed to disconnect Telegram account', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleCancelDisconnect = () => {
    setShowConfirmDialog(false)
  }

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    })
  }

  return (
    <>
    <section>
        <div className="row justify-center">
              <div className="col-lg-5">
                        <div className="alpha-profile-card mb-3">
                            <div className="alpha-profile-title-bx nw-kol-profile">
                                <div>
                                    <h6>Profile</h6>
                                </div>
                            </div>

                            <div className="alpha-profile-content nw-kol-profile">
                                <div className="alpha-profile-user-bx ">
                                    <div className="alpha-user-details">
                                        <img src="/profile-usr.png" alt="" />
                                        <div>
                                            <h4>
                                              {user?.walletAddress 
                                                ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
                                                : 'User'
                                              }
                                            </h4>
                                            <div className="nw-user-info-bx">
                                                <div>
                                                    <h6>Wallet</h6>
                                                    <p className="small">
                                                      {user?.walletAddress 
                                                        ? `${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}`
                                                        : 'Not connected'
                                                      }
                                                    </p>
                                                </div>
                                                <div>
                                                    <h6>Join date</h6>
                                                    <p>{formatDate(user?.lastLogin)}</p>
                                                </div>
                                            </div>

                                        </div>

                                    </div>

                                </div>
                            </div>

                        </div>

                        {user?.telegramChatId ? (
                          <div className="alpha-profile-card mb-3">
                              <div className="alpha-profile-title-bx nw-kol-profile">
                                  <div>
                                      <h6>Connected telegram account</h6>
                                  </div>

                                  <div>
                                      {showConfirmDialog ? (
                                        <div className="d-flex gap-2">
                                          <button 
                                            className="btn btn-danger btn-sm"
                                            onClick={handleConfirmDisconnect}
                                            disabled={disconnecting}
                                          >
                                            {disconnecting ? 'Disconnecting...' : 'Confirm'}
                                          </button>
                                          <button 
                                            className="btn btn-secondary btn-sm"
                                            onClick={handleCancelDisconnect}
                                            disabled={disconnecting}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button 
                                          className="dis-connect-btn"
                                          onClick={handleDisconnectClick}
                                        >
                                          disconnect <span className="text-white fz-14"><PiPlugs /></span>
                                        </button>
                                      )}
                                  </div>
                              </div>

                              <div className="alpha-profile-content nw-kol-profile">
                                  <div className="share-profile shre-profile-tilte">
                                      <img src="/profile-usr.png" alt="" />

                                      <div>
                                          <h4>User {user.telegramChatId}</h4>

                                          <button className="telegram-share-btn">
                                              <PiTelegramLogoDuotone />
                                              Connected
                                          </button>
                                      </div>
                                  </div>
                                  
                                  {showConfirmDialog && (
                                    <div className="alert alert-warning mt-3" role="alert">
                                      <strong>Warning:</strong> This will disconnect your Telegram account and delete all your alert subscriptions. This action cannot be undone.
                                    </div>
                                  )}
                              </div>

                          </div>
                        ) : (
                          <div className="alpha-profile-card mb-3">
                              <div className="alpha-profile-title-bx nw-kol-profile">
                                  <div>
                                      <h6>Telegram account</h6>
                                  </div>

                                  <div>
                                      <button 
                                        className="btn btn-primary btn-sm"
                                        onClick={() => navigate('/telegram-subscription')}
                                      >
                                        Connect Telegram
                                      </button>
                                  </div>
                              </div>

                              <div className="alpha-profile-content nw-kol-profile">
                                  <div className="text-center py-3">
                                      <p className="text-muted">No Telegram account connected</p>
                                      <p className="small">Connect to receive whale alerts</p>
                                  </div>
                              </div>
                          </div>
                        )}
                    </div>
        </div>
    </section>
    </>
  )
}

export default ProfilePage