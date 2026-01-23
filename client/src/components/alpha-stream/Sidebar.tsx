import { faChartLine, faCoins, faCrown, faRankingStar, faRss, faSatelliteDish, faStar } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { useState, useRef, useEffect } from "react"
import { BsLayoutSidebar } from "react-icons/bs"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import { useWalletConnection } from "../../hooks/useWalletConnection"
import { useToast } from "../../contexts/ToastContext"
import { User, LogOut } from "lucide-react"
import { HiChevronUpDown } from "react-icons/hi2"
import { FaRegUserCircle } from "react-icons/fa"

interface SidebarProps {
    isOpen?: boolean
    onToggle?: () => void
}

const SidebarContent = ({ collapsed, navigate, isActive, onToggle, isMobile = false }: { collapsed: boolean, navigate: any, isActive: (path: string) => boolean, onToggle?: () => void, isMobile?: boolean }) => {
    const { user, isAuthenticated, logout, openLoginModal } = useAuth()
    const { wallet, disconnect } = useWalletConnection()
    const { showToast } = useToast()
    const [showDropdown, setShowDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setShowDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleLinkClick = (path: string) => {
        navigate(path);
        if (window.innerWidth < 1024 && onToggle) {
            onToggle();
        }
    };

    const getDisplayName = () => {
        if (wallet.connected && wallet.address) {
            return `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`
        }
        if (user?.displayName) return user.displayName
        if (user?.email) return user.email.split("@")[0]
        if (user?.walletAddress)
            return `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`
        return "User"
    }

    const isUserConnected = (isAuthenticated && user) || wallet.connected

    return (
        <div className="flex flex-col h-full">
            <div className="left-sidebar-logo" style={{ padding: '8px 10px' }}>
                <div className="logo-box">
                    <img src="/logos.png" alt="logo" />
                </div>
                {/* Sidebar Toggle / Close Icon */}
                <a
                    href="#"
                    className="sidebar-icon"
                    onClick={(e) => {
                        e.preventDefault();
                        if (onToggle) onToggle();
                    }}
                >
                    <BsLayoutSidebar />
                </a>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <nav className="left-sidebar-list">
                    {!collapsed && <h6>ALPHA WHALES</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faChartLine} />
                                {!collapsed && <span>ALPHA STREAM</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/top-coins") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/top-coins")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faCoins} />
                                {!collapsed && <span>TOP COINS</span>}
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav className="left-sidebar-list">
                    {!collapsed && <h6>Influencer Intel</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/kol-feed") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/kol-feed")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faRss} />
                                {!collapsed && <span>KOL FEED</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/top-kol-coins") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/top-kol-coins")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faRankingStar} />
                                {!collapsed && <span>TOP KOL COINS</span>}
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav className="left-sidebar-list">
                    {!collapsed && <h6>Alpha Insights</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/whales-leaderboard") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/whales-leaderboard")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faCrown} />
                                {!collapsed && <span>WHALES LEADERBOARD</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/signal-engine") ? "nav-active" : ""}`}
                                onClick={() => handleLinkClick("/signal-engine")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faSatelliteDish} />
                                {!collapsed && <span>SIGNAL ENGINE</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/telegram-subscription") ? "nav-active" : ""}`}
                                onClick={() => {
                                    // Check if user is authenticated (either via email/social or wallet)
                                    if (!isAuthenticated && !wallet.connected) {
                                        showToast('Please log in to access Telegram Subscription', 'error');
                                        return;
                                    }
                                    handleLinkClick("/telegram-subscription");
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faStar} />
                                {!collapsed && <span>SUBSCRIPTION</span>}
                            </a>
                        </li>
                    </ul>
                </nav>
            </div>

            <div className="nav-btm-item mt-auto p-4 flex flex-col gap-4">
                {isMobile && (
                    <div className="flex flex-col gap-3 w-full">
                        {/* Telegram Subscription Button - Uses .connect-btn style */}
                        <button
                            className="connect-btn w-full justify-center text-center"
                            onClick={() => {
                                // Check if user is authenticated (either via email/social or wallet)
                                if (!isAuthenticated && !wallet.connected) {
                                    showToast('Please log in to access Telegram Subscription', 'error');
                                    return;
                                }
                                if (onToggle) onToggle();
                                navigate("/telegram-subscription");
                            }}
                        >
                            Telegram Subscription
                        </button>

                        {/* User Profile / Connect Button - Uses .nw-connected-btn style */}
                        {isUserConnected ? (
                            <div ref={dropdownRef} className="relative w-full">
                                <button
                                    className="nw-connected-btn w-full items-center"
                                    onClick={() => setShowDropdown(!showDropdown)}
                                >
                                    {user?.avatar ? (
                                        <img
                                            src={user.avatar}
                                            alt="User"
                                            style={{ width: "20px", height: "20px", borderRadius: "50%" }}
                                        />
                                    ) : (
                                        <span
                                            className="change-color"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                width: "20px",
                                                height: "20px",
                                                flexShrink: 0
                                            }}
                                        >
                                            <User size={14} />
                                        </span>
                                    )}

                                    <span className="mx-auto text-center truncate px-2">{getDisplayName()}</span>

                                    <HiChevronUpDown className="flex-shrink-0" />
                                </button>

                                {showDropdown && (
                                    <div className="user-dropdown" style={{ top: 'auto', bottom: '100%', left: 0, right: 0, width: '100%', marginBottom: '4px' }}>
                                        {user?.email && (
                                            <div className="user-dropdown-item" style={{ color: "#8F8F8F", cursor: "default" }}>
                                                {user.email}
                                            </div>
                                        )}

                                        <div
                                            className="user-dropdown-item"
                                            onClick={() => {
                                                setShowDropdown(false)
                                                if (onToggle) onToggle();
                                                navigate("/profile-page")
                                            }}
                                        >
                                            <FaRegUserCircle size={14} />
                                            Profile
                                        </div>

                                        <div
                                            className="user-dropdown-item"
                                            onClick={() => {
                                                setShowDropdown(false)
                                                if (onToggle) onToggle();
                                                if (wallet.connected) disconnect()
                                                logout()
                                            }}
                                        >
                                            <LogOut size={14} />
                                            Logout
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                className="connect-btn w-full justify-center text-center"
                                onClick={() => {
                                    if (onToggle) onToggle();
                                    openLoginModal();
                                }}
                            >
                                Connect Wallet
                            </button>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <ul className="nav-btm-list">
                        <li><a className="nav-btm-link" href="https://t.me/alphablock" target="_blank" rel="noopener noreferrer">telegram</a></li>
                        <li><span className="nw-slash">/</span></li>
                        <li><a className="nav-btm-link" href="https://x.com/alphablock" target="_blank" rel="noopener noreferrer">x.com</a></li>
                    </ul>
                    {!collapsed && <p>© 2025 AlphaBlock AI, All Rights Reserved.</p>}
                </div>
            </div>
        </div>
    );
};

function Sidebar({ isOpen = false, onToggle }: SidebarProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const { isAuthenticated } = useAuth()
    const { wallet } = useWalletConnection()
    const { showToast } = useToast()

    const isActive = (path: string) => {
        return location.pathname === path
    }

    const [collapsed, setCollapsed] = useState(false);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-md z-[9990] lg:hidden"
                    onClick={onToggle}
                />
            )}

            {/* MOBILE SIDEBAR (Clean implementation, no legacy classes) */}
            <div
                className={`fixed inset-y-0 right-0 z-[9999] w-[70%] bg-[#0a0a0a] border-l border-[#141414] p-[10px] transform transition-transform duration-300 ease-in-out lg:hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                style={{ display: 'flex', flexDirection: 'column' }} // Force flex
            >
                <div className="flex justify-end p-2 md:hidden">
                    {/* Add close button if needed, but overlay handles click-away */}
                </div>

                <SidebarContent
                    collapsed={false} // Never collapsed on mobile
                    navigate={navigate}
                    isActive={isActive}
                    onToggle={onToggle}
                    isMobile={true}
                />
            </div>

            {/* DESKTOP SIDEBAR (Legacy implementation preserved) */}
            <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} !hidden lg:!flex`} style={{ position: 'sticky', top: 0, height: '100vh', zIndex: 50 }}>
                <div className="left-sidebar-logo">
                    <div className="logo-box">
                        <img src="/logos.png" alt="logo" />
                    </div>

                    <a
                        href="#"
                        className="sidebar-icon"
                        onClick={(e) => {
                            e.preventDefault();
                            setCollapsed(!collapsed);
                        }}
                    >
                        <BsLayoutSidebar />
                    </a>
                </div>

                <nav className="left-sidebar-list">
                    {!collapsed && <h6>ALPHA WHALES</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/") ? "nav-active" : ""}`}
                                onClick={() => navigate("/")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faChartLine} />
                                {!collapsed && <span>ALPHA STREAM</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/top-coins") ? "nav-active" : ""}`}
                                onClick={() => navigate("/top-coins")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faCoins} />
                                {!collapsed && <span>TOP COINS</span>}
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav className="left-sidebar-list">
                    {!collapsed && <h6>Influencer Intel</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/kol-feed") ? "nav-active" : ""}`}
                                onClick={() => navigate("/kol-feed")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faRss} />
                                {!collapsed && <span>KOL FEED</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/top-kol-coins") ? "nav-active" : ""}`}
                                onClick={() => navigate("/top-kol-coins")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faRankingStar} />
                                {!collapsed && <span>TOP KOL COINS</span>}
                            </a>
                        </li>
                    </ul>
                </nav>

                <nav className="left-sidebar-list">
                    {!collapsed && <h6>Alpha Insights</h6>}
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/whales-leaderboard") ? "nav-active" : ""}`}
                                onClick={() => navigate("/whales-leaderboard")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faCrown} />
                                {!collapsed && <span>WHALES LEADERBOARD</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/signal-engine") ? "nav-active" : ""}`}
                                onClick={() => navigate("/signal-engine")}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faSatelliteDish} />
                                {!collapsed && <span>SIGNAL ENGINE</span>}
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive("/telegram-subscription") ? "nav-active" : ""}`}
                                onClick={() => {
                                    // Check if user is authenticated (either via email/social or wallet)
                                    if (!isAuthenticated && !wallet.connected) {
                                        showToast('Please log in to access Telegram Subscription', 'error');
                                        return;
                                    }
                                    navigate("/telegram-subscription");
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <FontAwesomeIcon icon={faStar} />
                                {!collapsed && <span>SUBSCRIPTION</span>}
                            </a>
                        </li>
                    </ul>
                </nav>

                <div className="nav-btm-item mt-auto">
                    <ul className="nav-btm-list">
                        <li><a className="nav-btm-link" href="https://t.me/alphablock" target="_blank" rel="noopener noreferrer">telegram</a></li>
                        <li><span className="nw-slash">/</span></li>
                        <li><a className="nav-btm-link" href="https://x.com/alphablock" target="_blank" rel="noopener noreferrer">x.com</a></li>
                    </ul>
                    {!collapsed && <p>© 2025 AlphaBlock AI, All Rights Reserved.</p>}
                </div>
            </aside>
        </>
    )
}

export default Sidebar
