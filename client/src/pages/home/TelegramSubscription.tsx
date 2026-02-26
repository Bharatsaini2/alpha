import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useEffect } from "react";
import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi";
import { RiVerifiedBadgeFill } from "react-icons/ri";
import { MdDelete } from "react-icons/md";
import { HiOutlineExternalLink } from "react-icons/hi";
import api from "../../lib/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePremiumAccess } from "../../contexts/PremiumAccessContext";
import { useWalletConnection } from "../../hooks/useWalletConnection";
import { getUserAvatarUrl } from "../../utils/avatarUtils";

interface AlertConfig {
    hotnessScoreThreshold?: number;
    walletLabels?: string[];
    minBuyAmountUSD?: number;
    minMarketCapUSD?: number;
    maxMarketCapUSD?: number;
    // Cluster alerts (Whale Cluster + KOL Cluster)
    timeWindowMinutes?: number;
    minClusterSize?: number;
    minInflowUSD?: number;
    // KOL Profile fields
    targetKolUsername?: string;
    targetKolAddress?: string;
    minHotnessScore?: number;
    minAmount?: number;
}

interface AlertSubscription {
    id: string;  // Changed from _id to match API response
    type: string;
    priority: string;
    enabled: boolean;
    config: AlertConfig;
    createdAt: string;
    updatedAt: string;
}

function TelegramSubscription() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
    const { wallet } = useWalletConnection();
    const { validateAccess } = usePremiumAccess();
    const [openId, setOpenId] = useState<string | null>(null);
    const [subscriptions, setSubscriptions] = useState<AlertSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [generatingLink, setGeneratingLink] = useState(false);
    const [, setHasAccess] = useState<boolean>(false);
    const [connectionCheckInterval, setConnectionCheckInterval] = useState<NodeJS.Timeout | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

    // ... (rest of helper functions) ...

    // Check authentication and premium access on mount
    useEffect(() => {
        if (authLoading) return; // Wait for auth check to complete

        // Check if user is authenticated (either via email/social or wallet)
        if (!isAuthenticated && !wallet.connected) {
            showToast('Please log in to access Telegram Subscription', 'error');
            navigate('/');
            return;
        }

        // Validate premium access via context (shows modal if failed)
        validateAccess(() => {
            setHasAccess(true);
            fetchSubscriptions();
        });

    }, [isAuthenticated, authLoading, wallet.connected]);



    const toggleAccordion = (id: string) => {
        setOpenId(openId === id ? null : id);
    };

    // Check for Telegram connection status updates
    const checkTelegramConnection = async () => {
        try {
            const response = await api.get('/auth/me');

            if (response.data.success && response.data.data?.user) {
                const updatedUser = response.data.data.user;

                // If user now has telegramChatId but didn't before, update the auth context
                if (updatedUser.telegramChatId && !user?.telegramChatId) {
                    // Use refreshUser from AuthContext instead of page reload for seamless update
                    await refreshUser();
                    showToast('Telegram connected successfully!', 'success');
                    // Clear the link token and stop polling
                    setLinkToken(null);
                    if (connectionCheckInterval) {
                        clearInterval(connectionCheckInterval);
                        setConnectionCheckInterval(null);
                    }
                }
            }
        } catch {
            // Connection check failed; avoid logging sensitive details
        }
    };

    // Start polling for connection status when link token is generated
    useEffect(() => {
        if (linkToken && !user?.telegramChatId) {
            // Start checking every 3 seconds for connection
            const interval = setInterval(checkTelegramConnection, 3000);
            setConnectionCheckInterval(interval);

            // Stop checking after 10 minutes (when token expires)
            setTimeout(() => {
                if (interval) {
                    clearInterval(interval);
                    setConnectionCheckInterval(null);
                }
            }, 10 * 60 * 1000);

            return () => {
                if (interval) {
                    clearInterval(interval);
                }
            };
        }
    }, [linkToken, user?.telegramChatId]);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
            }
        };
    }, [connectionCheckInterval]);



    const fetchSubscriptions = async () => {
        try {
            setLoading(true);
            setError(null);
            // Use my-alerts endpoint to get ALL alert types (whale + KOL)
            const response = await api.get('/alerts/my-alerts');

            if (response.data.success) {
                const alerts = response.data.data.alerts || [];
                setSubscriptions(alerts);
            } else {
                setError('Failed to load subscriptions');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (alertId: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
            // Use native event for more aggressive stopping
            e.nativeEvent.stopImmediatePropagation();
        }
        setDeleteConfirmId(alertId);
    };

    const handleDeleteConfirm = async (e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
            e.nativeEvent.stopImmediatePropagation();
        }
        if (!deleteConfirmId) return;

        // Find the subscription to determine its type
        const subscription = subscriptions.find(sub => sub.id === deleteConfirmId);
        if (!subscription) {
            showToast('Subscription not found', 'error');
            return;
        }

        try {
            setDeleting(true);

            // Use the appropriate delete endpoint based on alert type
            let deleteEndpoint = '';
            if (subscription.type === 'ALPHA_STREAM') {
                deleteEndpoint = `/alerts/whale-alert/${deleteConfirmId}`;
            } else if (subscription.type === 'KOL_ACTIVITY') {
                deleteEndpoint = `/alerts/kol-alert/${deleteConfirmId}`;
            } else {
                // Fallback to generic delete endpoint
                deleteEndpoint = `/alerts/${deleteConfirmId}`;
            }

            const response = await api.delete(deleteEndpoint);

            if (response.data.success) {
                // Show success toast
                showToast('Subscription deleted successfully', 'success');

                // Reset delete confirmation state
                setDeleteConfirmId(null);

                // Refetch subscriptions to get updated list from server
                await fetchSubscriptions();
            } else {
                setError('Failed to delete subscription');
                showToast('Failed to delete subscription', 'error');
            }
        } catch (err: any) {
            const errorMessage = err.response?.data?.message || 'Failed to delete subscription';
            setError(errorMessage);
            showToast(errorMessage, 'error');
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteCancel = (e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
            e.nativeEvent.stopImmediatePropagation();
        }
        setDeleteConfirmId(null);
    };

    const handleGenerateLinkToken = async () => {
        // Validate access before generating link
        validateAccess(async () => {
            // Access is valid, proceed with generation
            try {
                setGeneratingLink(true);
                const response = await api.post('/alerts/link');

                if (response.data.success) {
                    setLinkToken(response.data.data.token);
                    // Store the full response for the deep link
                    localStorage.setItem('telegramLinkResponse', JSON.stringify(response.data));
                    showToast('Link token generated! Click the link below to connect Telegram', 'success');
                } else {
                    showToast('Failed to generate link token', 'error');
                }
            } catch (err: any) {
                showToast(err.response?.data?.message || 'Failed to generate link token', 'error');
            } finally {
                setGeneratingLink(false);
            }
        });
    };

    const handleDisconnectTelegram = async () => {
        try {
            setDisconnecting(true);
            setShowDisconnectConfirm(false);
            const response = await api.post('/alerts/unlink-telegram');

            if (response.data.success) {
                // Refresh user data to remove telegramChatId
                await refreshUser();
                // Clear subscriptions since they were all deleted
                setSubscriptions([]);
                showToast(
                    `Telegram disconnected successfully. ${response.data.data.alertsDeleted} alert(s) deleted.`,
                    'success'
                );
            } else {
                showToast('Failed to disconnect Telegram account', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to disconnect Telegram account', 'error');
        } finally {
            setDisconnecting(false);
        }
    };


    const getTelegramDeepLink = () => {
        if (!linkToken) return '';
        // Use the deepLink from the API response if available, otherwise fallback to production bot
        const response = JSON.parse(localStorage.getItem('telegramLinkResponse') || '{}');
        if (response.data?.deepLink) {
            return response.data.deepLink;
        }
        return `https://t.me/AlphaBlockAIbot?start=${linkToken}`;
    };

    const formatMcap = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
        return `$${value}`;
    };

    const formatConfig = (config: AlertConfig, type?: string): string => {
        const parts: string[] = [];

        // Cluster alerts (WHALE_CLUSTER, KOL_CLUSTER): timeframe, min wallets, min volume, market cap
        if (config.timeWindowMinutes !== undefined) {
            parts.push(`Timeframe: ${config.timeWindowMinutes} min`);
        }
        if (config.minClusterSize !== undefined) {
            const label = type === 'KOL_CLUSTER' ? 'KOL wallets' : 'Whale wallets';
            parts.push(`Min ${label}: ${config.minClusterSize}`);
        }
        if (config.minInflowUSD !== undefined && config.minInflowUSD > 0) {
            parts.push(`Min volume: $${config.minInflowUSD.toLocaleString()}`);
        }

        if (config.hotnessScoreThreshold !== undefined) {
            parts.push(`Hotness: ${config.hotnessScoreThreshold}/10`);
        }

        if (config.minBuyAmountUSD !== undefined) {
            parts.push(`Min Buy: $${config.minBuyAmountUSD.toLocaleString()}`);
        }

        // Market Cap Range
        if (config.minMarketCapUSD !== undefined || config.maxMarketCapUSD !== undefined) {
            const minMcap = config.minMarketCapUSD !== undefined ? formatMcap(config.minMarketCapUSD) : '$0';
            const maxMcap = config.maxMarketCapUSD !== undefined && config.maxMarketCapUSD >= 50000000 
                ? '$50M+' 
                : config.maxMarketCapUSD !== undefined ? formatMcap(config.maxMarketCapUSD) : '∞';
            parts.push(`MCap: ${minMcap}-${maxMcap}`);
        }

        // KOL Profile specific fields
        if (config.targetKolUsername) {
            const username = config.targetKolUsername.startsWith('@')
                ? config.targetKolUsername
                : `@${config.targetKolUsername}`;
            parts.push(`KOL: ${username}`);
        }

        if (config.minHotnessScore !== undefined) {
            parts.push(`Hotness: ${config.minHotnessScore}/10`);
        }

        if (config.minAmount !== undefined) {
            parts.push(`Min: $${config.minAmount.toLocaleString()}`);
        }

        if (config.walletLabels && config.walletLabels.length > 0) {
            parts.push(`Labels: ${config.walletLabels.join(', ')}`);
        }

        return parts.length ? parts.join(' | ') : 'Default';
    };

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };



    return (
        <section className="telegram-subscription-section">
            <div className="row justify-center">
                <div className="col-lg-5">
                    {/* Back Button */}
                    <div className="mb-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="alpha-edit-btn"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                            Back
                        </button>
                    </div>

                    {/* Connection Status Card */}
                    <div className="alpha-profile-card mb-3">
                        <div className="alpha-profile-title-bx nw-kol-profile">
                            <div>
                                <h6>Telegram Account</h6>
                            </div>
                            <div>
                                {user?.telegramChatId ? (
                                    <div className="dis-connect-btn">
                                        Connected <span className="text-white fz-14"><PiPlugs /></span>
                                    </div>
                                ) : (
                                    <button
                                        className="subscribe-btn"
                                        onClick={handleGenerateLinkToken}
                                        disabled={generatingLink}
                                    >
                                        {generatingLink ? 'Generating...' : 'Connect'}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="alpha-profile-content nw-kol-profile">
                            {user?.telegramChatId ? (
                                <>
                                    <div className="share-profile">
                                        <img src={getUserAvatarUrl(user?.avatar)} alt="User Avatar" />
                                        <div>
                                            <h4>
                                                {user.telegramUsername 
                                                    ? `@${user.telegramUsername}` 
                                                    : user.telegramFirstName || 'User'}
                                            </h4>
                                            <button className="telegram-share-btn mt-2">
                                                <PiTelegramLogoDuotone />
                                                Connected
                                            </button>
                                        </div>
                                    </div>

                                    {/* Disconnect Section */}
                                    <div className="mt-3" style={{ borderTop: '1px solid #292929', paddingTop: '12px' }}>
                                        {showDisconnectConfirm ? (
                                            <div className="text-center">
                                                <p style={{ color: '#df2a4e', fontSize: '10px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                                                    This will disconnect Telegram and delete all your alerts. Continue?
                                                </p>
                                                <div className="d-flex gap-2 justify-content-center">
                                                    <button
                                                        className="alpha-edit-btn"
                                                        onClick={handleDisconnectTelegram}
                                                        disabled={disconnecting}
                                                        style={{
                                                            backgroundColor: '#df2a4e',
                                                            borderColor: '#df2a4e',
                                                            padding: '5px 10px',
                                                            fontSize: '10px'
                                                        }}
                                                    >
                                                        {disconnecting ? 'Disconnecting...' : 'Yes, Disconnect'}
                                                    </button>
                                                    <button
                                                        className="alpha-edit-btn"
                                                        onClick={() => setShowDisconnectConfirm(false)}
                                                        disabled={disconnecting}
                                                        style={{
                                                            padding: '5px 10px',
                                                            fontSize: '10px'
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                className="alpha-edit-btn"
                                                onClick={() => setShowDisconnectConfirm(true)}
                                                style={{
                                                    backgroundColor: '#0a0a0a',
                                                    borderColor: '#3d3d3d',
                                                    padding: '5px 10px',
                                                    fontSize: '10px',
                                                    width: '100%',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                Disconnect Telegram
                                            </button>
                                        )}
                                    </div>
                                </>
                            ) : linkToken ? (
                                <div className="text-center py-3">
                                    <p className="mb-3" style={{ color: '#ebebeb', fontSize: '12px', textTransform: 'uppercase' }}>
                                        Click to open Telegram and connect your account:
                                    </p>
                                    <a
                                        href={getTelegramDeepLink()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="nw-connect-wallet-btn"
                                        style={{ textDecoration: 'none', display: 'inline-flex', width: 'auto', padding: '10px 20px' }}
                                    >
                                        <PiTelegramLogoDuotone className="me-2" />
                                        Open Telegram Bot
                                        <HiOutlineExternalLink className="ms-2" />
                                    </a>
                                    <p className="mt-3" style={{ color: '#8f8f8f', fontSize: '10px', textTransform: 'uppercase' }}>
                                        Link expires in 10 minutes
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-3">
                                    <p style={{ color: '#8f8f8f', fontSize: '12px', textTransform: 'uppercase', marginBottom: 0 }}>
                                        Connect your Telegram account to receive whale alerts directly in your chat.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Subscriptions Header */}
                    <div className="subscription-all-number mb-2">
                        <div>
                            <h6>Alert Subscriptions</h6>
                        </div>
                        <div>
                            <h6>[ {subscriptions.length} ]</h6>
                        </div>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="alpha-profile-card">
                            <div className="alpha-profile-content nw-kol-profile text-center py-4">
                                <p style={{ color: '#8f8f8f', fontSize: '12px', textTransform: 'uppercase' }}>
                                    Loading subscriptions...
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="alpha-profile-card">
                            <div className="alpha-profile-content nw-kol-profile">
                                <p style={{ color: '#df2a4e', fontSize: '12px', textTransform: 'uppercase' }}>
                                    {error}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && !error && subscriptions.length === 0 && (
                        <div className="alpha-profile-card">
                            <div className="alpha-profile-content nw-kol-profile text-center py-4">
                                <PiTelegramLogoDuotone style={{ fontSize: '48px', color: '#3d3d3d', marginBottom: '16px' }} />
                                <h4 style={{ color: '#ebebeb', fontSize: '14px', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    No Active Subscriptions
                                </h4>
                                <p style={{ color: '#8f8f8f', fontSize: '12px', textTransform: 'uppercase', marginBottom: 0 }}>
                                    Create whale alerts to start receiving notifications
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Subscriptions List */}
                    {!loading && !error && subscriptions.length > 0 && (
                        <div className="subscripton-bx" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            <div className="accordion">
                                {subscriptions.map((subscription) => (
                                    <div className="accordion-item" key={subscription.id}>
                                        <h2 className="accordion-header">
                                            <button
                                                type="button"
                                                onClick={() => toggleAccordion(subscription.id)}
                                                className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === subscription.id ? "" : "collapsed"
                                                    }`}
                                            >
                                                <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                    <div className="share-profile">
                                                        <div>
                                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                {subscription.type === 'ALPHA_STREAM' ? 'Whale Alert' : subscription.type === 'WHALE_CLUSTER' ? 'Whale Cluster Alert' : subscription.type === 'KOL_CLUSTER' ? 'KOL Cluster Alert' : subscription.type === 'KOL_ACTIVITY' ? 'KOL Alert' : subscription.type === 'KOL_PROFILE' ? 'KOL Profile' : subscription.type}
                                                                {subscription.enabled && <RiVerifiedBadgeFill style={{ color: '#14904d', fontSize: '12px' }} />}
                                                            </h4>
                                                            <p style={{
                                                                color: '#ebebeb',
                                                                fontSize: '10px',
                                                                textTransform: 'uppercase',
                                                                marginBottom: '2px',
                                                                fontWeight: 500
                                                            }}>
                                                                {formatConfig(subscription.config, subscription.type)}
                                                            </p>
                                                            <p style={{
                                                                color: '#8f8f8f',
                                                                fontSize: '10px',
                                                                textTransform: 'uppercase',
                                                                marginBottom: 0
                                                            }}>
                                                                {formatDate(subscription.createdAt)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        </h2>

                                        {openId === subscription.id && (
                                            <div className="accordion-collapse show">
                                                <div className="accordion-body" style={{ backgroundColor: '#0a0a0a', border: '1px solid #292929', borderTop: 'none', padding: '10px' }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        flexDirection: 'row',
                                                        alignItems: 'flex-start',
                                                        gap: '20px',
                                                        marginBottom: '10px'
                                                    }}>
                                                        <div style={{ flex: '1' }}>
                                                            <h6 style={{ fontSize: '9px', marginBottom: '3px', color: '#8f8f8f', textTransform: 'uppercase', fontWeight: 400 }}>Configuration</h6>
                                                            <p style={{ fontSize: '10px', margin: '0', color: '#ebebeb', textTransform: 'uppercase' }}>{formatConfig(subscription.config, subscription.type)}</p>
                                                        </div>

                                                        <div style={{ minWidth: '70px' }}>
                                                            <h6 style={{ fontSize: '9px', marginBottom: '3px', color: '#8f8f8f', textTransform: 'uppercase', fontWeight: 400 }}>Status</h6>
                                                            <p style={{
                                                                color: subscription.enabled ? '#14904d' : '#8f8f8f',
                                                                fontSize: '10px',
                                                                margin: '0',
                                                                fontWeight: 500,
                                                                textTransform: 'uppercase'
                                                            }}>
                                                                {subscription.enabled ? 'Active' : 'Inactive'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div style={{ borderTop: '1px solid #292929', paddingTop: '10px' }}>
                                                        {deleteConfirmId === subscription.id ? (
                                                            <div className="text-center">
                                                                <p style={{ color: '#ebebeb', fontSize: '10px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }}>
                                                                    Are you sure?
                                                                </p>
                                                                <div className="d-flex gap-2 justify-content-center">
                                                                    <button
                                                                        className="alpha-edit-btn"
                                                                        onClick={(e) => handleDeleteConfirm(e)}
                                                                        disabled={deleting}
                                                                        style={{
                                                                            backgroundColor: '#df2a4e',
                                                                            borderColor: '#df2a4e',
                                                                            padding: '5px 10px',
                                                                            fontSize: '10px'
                                                                        }}
                                                                    >
                                                                        {deleting ? 'Deleting...' : 'Yes'}
                                                                    </button>
                                                                    <button
                                                                        className="alpha-edit-btn"
                                                                        onClick={(e) => handleDeleteCancel(e)}
                                                                        disabled={deleting}
                                                                        style={{
                                                                            padding: '5px 10px',
                                                                            fontSize: '10px'
                                                                        }}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                className="alpha-edit-btn"
                                                                onClick={(e) => handleDeleteClick(subscription.id, e)}
                                                                style={{
                                                                    backgroundColor: '#df2a4e',
                                                                    borderColor: '#df2a4e',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    padding: '5px 10px',
                                                                    fontSize: '10px',
                                                                    width: '100%',
                                                                    justifyContent: 'center'
                                                                }}
                                                            >
                                                                <MdDelete style={{ fontSize: '12px' }} />
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

export default TelegramSubscription