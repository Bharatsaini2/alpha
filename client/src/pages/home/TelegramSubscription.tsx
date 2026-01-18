import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PiPlugs, PiTelegramLogoDuotone } from "react-icons/pi";
import { RiVerifiedBadgeFill } from "react-icons/ri";

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

    const [openId, setOpenId] = useState(null);

    const toggleAccordion = (id) => {
        setOpenId(openId === id ? null : id);
    };



    return (
        <>
            <section className="">

                <div className="row justify-content-center">
                    <div className="col-lg-4 col-md-12 col-sm-12">
                        <div className="">
                            <a href="javascript:void(0)" className="back-link mb-2"> <FontAwesomeIcon icon={faArrowLeft}/> Back</a>
                        </div>

                        <div className="alpha-profile-card mb-3">
                            <div className="alpha-profile-title-bx nw-kol-profile">
                                <div>
                                    <h6>Connected telegram account</h6>
                                </div>

                                <div>
                                    <button className="dis-connect-btn">disconnect <span className="text-white fz-14"><PiPlugs /></span></button>
                                </div>
                            </div>

                            <div className="alpha-profile-content nw-kol-profile">
                                <div className="share-profile">
                                    <img src="/profile-usr.png" alt="" />

                                    <div>
                                        <h4>BLissful design</h4>

                                        <button className="telegram-share-btn mt-2">
                                            <PiTelegramLogoDuotone />

                                            @gamerx
                                        </button>


                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="subscription-all-number mb-2">
                            <div>
                                <h6>List of Subscription Alerts</h6>
                            </div>
                            <div>
                                <h6>[ 8 ]</h6>
                            </div>
                        </div>

                        <div className="subscripton-bx">
                            <div className="accordion">

                                {/* ITEM 1 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto1")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto1" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @blissful
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto1" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ITEM 2 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto2")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto2" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto2" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 3 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto3")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto3" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto3" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 4 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto4")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto4" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto4" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>


                                {/* ITEM 5 */}
                                <div className="accordion-item">
                                    <h2 className="accordion-header">
                                        <button
                                            type="button"
                                            onClick={() => toggleAccordion("crypto5")}
                                            className={`accordion-button d-flex align-items-center gap-3 custom-accordion-btn ${openId === "crypto5" ? "" : "collapsed"
                                                }`}
                                        >
                                            <div className="alpha-profile-content d-flex justify-content-between w-100 align-items-center nw-kol-profile">
                                                <div className="share-profile">
                                                    <img src="/profile-usr.png" alt="" />
                                                    <div>
                                                        <h4>
                                                            BLissful design <RiVerifiedBadgeFill />
                                                        </h4>
                                                        <button className="telegram-share-btn mt-2">
                                                            <PiTelegramLogoDuotone /> @crypt
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        </button>
                                    </h2>

                                    {openId === "crypto5" && (
                                        <div className="accordion-collapse show">
                                            <div className="accordion-body text-secondary">
                                                Extra details / description yahan aayegi.
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>



                    </div>



                </div>
            </section>
        </>
    )
}

export default TelegramSubscription