import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useEffect } from "react";
import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi";
import { RiVerifiedBadgeFill } from "react-icons/ri";
import { MdDelete, MdExpandMore, MdExpandLess } from "react-icons/md";
import { HiOutlineExternalLink } from "react-icons/hi";
import api from "../../lib/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../contexts/AuthContext";

interface AlertConfig {
    hotnessScoreThreshold?: number;
    walletLabels?: string[];
    minBuyAmountUSD?: number;
}

interface AlertSubscription {
    _id: string;
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
    const { user, isAuthenticated } = useAuth();
    const [openId, setOpenId] = useState<string | null>(null);
    const [subscriptions, setSubscriptions] = useState<AlertSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [generatingLink, setGeneratingLink] = useState(false);
    const [checkingBalance, setCheckingBalance] = useState(false);
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);

    const toggleAccordion = (id: string) => {
        setOpenId(openId === id ? null : id);
    };

    const checkPremiumAccess = async (showToastOnError = false, forceRefresh = false) => {
        try {
            setCheckingBalance(true);
            const url = forceRefresh 
                ? '/alerts/premium-access?refresh=true' 
                : '/alerts/premium-access';
            const response = await api.get(url);
            
            if (response.data.success) {
                setHasAccess(response.data.data.hasAccess);
                if (!response.data.data.hasAccess && showToastOnError) {
                    const difference = response.data.data.difference || 0;
                    showToast(
                        `Premium access required. You need ${difference.toFixed(4)} more SOL.`,
                        'error'
                    );
                }
            }
        } catch (err: any) {
            console.error('Error checking premium access:', err);
            setHasAccess(false);
        } finally {
            setCheckingBalance(false);
        }
    };

    // Check authentication on mount
    useEffect(() => {
        if (!isAuthenticated) {
            showToast('Please log in to view your subscriptions', 'error');
            setTimeout(() => navigate('/'), 2000);
            return;
        }
        fetchSubscriptions();
        checkPremiumAccess(false); // Don't show toast on initial load
    }, [isAuthenticated, navigate, showToast]);

    const fetchSubscriptions = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/alerts/whale-alerts');
            
            console.log('Fetched subscriptions:', response.data);
            
            if (response.data.success) {
                const alerts = response.data.data.alerts || [];
                console.log('Setting subscriptions:', alerts);
                setSubscriptions(alerts);
            } else {
                setError('Failed to load subscriptions');
            }
        } catch (err: any) {
            console.error('Error fetching subscriptions:', err);
            setError(err.response?.data?.message || 'Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (alertId: string) => {
        setDeleteConfirmId(alertId);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirmId) return;

        console.log('Deleting subscription with ID:', deleteConfirmId);

        try {
            setDeleting(true);
            const response = await api.delete(`/alerts/whale-alert/${deleteConfirmId}`);
            
            console.log('Delete response:', response.data);
            
            if (response.data.success) {
                // Show success toast
                showToast('Subscription deleted successfully', 'success');
                
                // Reset delete confirmation state
                setDeleteConfirmId(null);
                
                // Refetch subscriptions to get updated list from server
                console.log('Refetching subscriptions...');
                await fetchSubscriptions();
                console.log('Subscriptions refetched');
            } else {
                setError('Failed to delete subscription');
                showToast('Failed to delete subscription', 'error');
            }
        } catch (err: any) {
            console.error('Error deleting subscription:', err);
            const errorMessage = err.response?.data?.message || 'Failed to delete subscription';
            setError(errorMessage);
            showToast(errorMessage, 'error');
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteConfirmId(null);
    };

    const handleGenerateLinkToken = async () => {
        // Force refresh balance check and show toast if insufficient
        await checkPremiumAccess(true, true);
        
        // Wait for state update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (hasAccess === false) {
            return;
        }

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
            console.error('Error generating link token:', err);
            const errorMsg = err.response?.data?.message || 'Failed to generate link token';
            // Only show toast if it's not a duplicate premium access error
            if (!errorMsg.includes('Premium access required')) {
                showToast(errorMsg, 'error');
            }
        } finally {
            setGeneratingLink(false);
        }
    };

    const getTelegramDeepLink = () => {
        if (!linkToken) return '';
        // Use the deepLink from the API response if available, otherwise fallback to dev bot
        const response = JSON.parse(localStorage.getItem('telegramLinkResponse') || '{}');
        if (response.data?.deepLink) {
            return response.data.deepLink;
        }
        return `https://t.me/alphabotdevbot?start=${linkToken}`;
    };

    const formatConfig = (config: AlertConfig): string => {
        const parts: string[] = [];
        
        if (config.hotnessScoreThreshold !== undefined) {
            parts.push(`Hotness: ${config.hotnessScoreThreshold}/10`);
        }
        
        if (config.minBuyAmountUSD !== undefined) {
            parts.push(`Min Buy: $${config.minBuyAmountUSD.toLocaleString()}`);
        }
        
        if (config.walletLabels && config.walletLabels.length > 0) {
            parts.push(`Labels: ${config.walletLabels.join(', ')}`);
        }
        
        return parts.join(' | ');
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

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'high': return '#df2a4e';
            case 'medium': return '#ffa502';
            case 'low': return '#14904d';
            default: return '#8f8f8f';
        }
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
                                <div className="share-profile">
                                    <img src="/profile-usr.png" alt="" />
                                    <div>
                                        <h4>User {user.telegramChatId}</h4>
                                        <button className="telegram-share-btn mt-2">
                                            <PiTelegramLogoDuotone />
                                            Connected
                                        </button>
                                    </div>
                                </div>
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
                                    <div className="accordion-item" key={subscription._id}>
                                        <h2 className="accordion-header">
                                            <button
                                                type="button"
                                                onClick={() => toggleAccordion(subscription._id)}
                                                className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${
                                                    openId === subscription._id ? "" : "collapsed"
                                                }`}
                                            >
                                                <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                    <div className="share-profile">
                                                        <div>
                                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                {subscription.type === 'ALPHA_STREAM' ? 'Whale Alert' : subscription.type}
                                                                {subscription.enabled && <RiVerifiedBadgeFill style={{ color: '#14904d', fontSize: '12px' }} />}
                                                                <span 
                                                                    style={{ 
                                                                        backgroundColor: getPriorityColor(subscription.priority),
                                                                        color: '#fff',
                                                                        padding: '2px 6px',
                                                                        fontSize: '10px',
                                                                        textTransform: 'uppercase',
                                                                        marginLeft: '8px'
                                                                    }}
                                                                >
                                                                    {subscription.priority}
                                                                </span>
                                                            </h4>
                                                            <p style={{ 
                                                                color: '#ebebeb', 
                                                                fontSize: '10px', 
                                                                textTransform: 'uppercase',
                                                                marginBottom: '2px',
                                                                fontWeight: 500
                                                            }}>
                                                                {formatConfig(subscription.config)}
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

                                        {openId === subscription._id && (
                                            <div className="accordion-collapse show">
                                                <div className="accordion-body" style={{ backgroundColor: '#0a0a0a', border: '1px solid #292929', borderTop: 'none' }}>
                                                    <div style={{ padding: '16px' }}>
                                                        <div className="nw-user-info-bx" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '16px', paddingTop: '0' }}>
                                                            <div>
                                                                <h6>Configuration</h6>
                                                                <p>{formatConfig(subscription.config)}</p>
                                                            </div>
                                                            
                                                            <div>
                                                                <h6>Status</h6>
                                                                <p style={{ color: subscription.enabled ? '#14904d' : '#8f8f8f' }}>
                                                                    {subscription.enabled ? 'Active' : 'Inactive'}
                                                                </p>
                                                            </div>

                                                            <div>
                                                                <h6>Priority</h6>
                                                                <p style={{ color: getPriorityColor(subscription.priority) }}>
                                                                    {subscription.priority}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div style={{ borderTop: '1px solid #292929', paddingTop: '16px', marginTop: '16px' }}>
                                                            {deleteConfirmId === subscription._id ? (
                                                                <div className="text-center">
                                                                    <p style={{ color: '#ebebeb', fontSize: '12px', textTransform: 'uppercase', marginBottom: '16px' }}>
                                                                        Are you sure you want to delete this subscription?
                                                                    </p>
                                                                    <div className="d-flex gap-2 justify-content-center">
                                                                        <button 
                                                                            className="alpha-edit-btn"
                                                                            onClick={handleDeleteConfirm}
                                                                            disabled={deleting}
                                                                            style={{ backgroundColor: '#df2a4e', borderColor: '#df2a4e' }}
                                                                        >
                                                                            {deleting ? 'Deleting...' : 'Yes, Delete'}
                                                                        </button>
                                                                        <button 
                                                                            className="alpha-edit-btn"
                                                                            onClick={handleDeleteCancel}
                                                                            disabled={deleting}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button 
                                                                    className="alpha-edit-btn"
                                                                    onClick={() => handleDeleteClick(subscription._id)}
                                                                    style={{ backgroundColor: '#df2a4e', borderColor: '#df2a4e', display: 'flex', alignItems: 'center', gap: '5px' }}
                                                                >
                                                                    <MdDelete />
                                                                    Delete Subscription
                                                                </button>
                                                            )}
                                                        </div>
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