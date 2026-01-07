import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useEffect } from "react";
import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi";
import { RiVerifiedBadgeFill } from "react-icons/ri";
import { MdDelete } from "react-icons/md";
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



    return (
        <>
            <section className="">
                <div className="row justify-content-center">
                    <div className="col-lg-4 col-md-12 col-sm-12">
                        <div className="">
                            <a href="javascript:void(0)" onClick={() => navigate(-1)} className="back-link mb-2"> 
                                <FontAwesomeIcon icon={faArrowLeft}/> Back
                            </a>
                        </div>

                        <div className="alpha-profile-card mb-3">
                            <div className="alpha-profile-title-bx nw-kol-profile">
                                <div>
                                    <h6>Telegram Account</h6>
                                </div>

                                <div>
                                    {user?.telegramChatId ? (
                                        <button className="dis-connect-btn">
                                            Connected <span className="text-white fz-14"><PiPlugs /></span>
                                        </button>
                                    ) : (
                                        <button 
                                            className="btn btn-primary btn-sm"
                                            onClick={handleGenerateLinkToken}
                                            disabled={generatingLink}
                                        >
                                            {generatingLink ? 'Generating...' : 'Connect Telegram'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {user?.telegramChatId ? (
                                <div className="alpha-profile-content nw-kol-profile">
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
                                </div>
                            ) : linkToken ? (
                                <div className="alpha-profile-content nw-kol-profile">
                                    <div className="text-center py-3">
                                        <p className="mb-3">Click the button below to connect your Telegram account:</p>
                                        <a 
                                            href={getTelegramDeepLink()} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="btn btn-success"
                                        >
                                            <PiTelegramLogoDuotone className="me-2" />
                                            Open Telegram Bot
                                        </a>
                                        <p className="small text-muted mt-3">Link expires in 10 minutes</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="alpha-profile-content nw-kol-profile">
                                    <div className="text-center py-3">
                                        <p className="text-muted">No Telegram account connected</p>
                                        <p className="small">Click "Connect Telegram" to get started</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="subscription-all-number mb-2">
                            <div>
                                <h6>List of Subscription Alerts</h6>
                            </div>
                            <div>
                                <h6>[ {subscriptions.length} ]</h6>
                            </div>
                        </div>

                        {loading && (
                            <div className="text-center py-4">
                                <p>Loading subscriptions...</p>
                            </div>
                        )}

                        {error && (
                            <div className="alert alert-danger" role="alert">
                                {error}
                            </div>
                        )}

                        {!loading && !error && subscriptions.length === 0 && (
                            <div className="text-center py-4">
                                <p>No active subscriptions found.</p>
                            </div>
                        )}

                        {!loading && !error && subscriptions.length > 0 && (
                            <div className="subscripton-bx">
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
                                                                <h4>
                                                                    {subscription.type === 'ALPHA_STREAM' ? 'Whale Alert' : subscription.type}
                                                                    {subscription.enabled && <RiVerifiedBadgeFill className="ms-2" />}
                                                                </h4>
                                                                <p className="text-muted small mb-0">
                                                                    {formatDate(subscription.createdAt)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            </h2>

                                            {openId === subscription._id && (
                                                <div className="accordion-collapse show">
                                                    <div className="accordion-body">
                                                        <div className="mb-3">
                                                            <strong>Configuration:</strong>
                                                            <p className="mb-1">{formatConfig(subscription.config)}</p>
                                                        </div>
                                                        
                                                        <div className="mb-3">
                                                            <strong>Status:</strong>
                                                            <span className={`ms-2 badge ${subscription.enabled ? 'bg-success' : 'bg-secondary'}`}>
                                                                {subscription.enabled ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </div>

                                                        <div className="mb-3">
                                                            <strong>Priority:</strong>
                                                            <span className="ms-2">{subscription.priority}</span>
                                                        </div>

                                                        {deleteConfirmId === subscription._id ? (
                                                            <div className="d-flex gap-2">
                                                                <button 
                                                                    className="btn btn-danger btn-sm"
                                                                    onClick={handleDeleteConfirm}
                                                                    disabled={deleting}
                                                                >
                                                                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                                                                </button>
                                                                <button 
                                                                    className="btn btn-secondary btn-sm"
                                                                    onClick={handleDeleteCancel}
                                                                    disabled={deleting}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                className="btn btn-danger btn-sm"
                                                                onClick={() => handleDeleteClick(subscription._id)}
                                                            >
                                                                <MdDelete className="me-1" />
                                                                Delete Subscription
                                                            </button>
                                                        )}
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
        </>
    );
}

export default TelegramSubscription