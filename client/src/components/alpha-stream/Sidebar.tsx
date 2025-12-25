import { faChartLine, faCoins, faCrown, faRankingStar, faRss, faSatelliteDish, faStar, faWaveSquare } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { BsLayoutSidebar } from "react-icons/bs"
import { useNavigate, useLocation } from "react-router-dom"

function Sidebar() {
    const navigate = useNavigate()
    const location = useLocation()

    const isActive = (path: string) => {
        return location.pathname === path
    }

    return (
        
       <>
        <aside className="sidebar">
            <div className="left-sidebar-logo">
                <div>
                    <img src="/logos.png" alt="logo" />
                </div>
                <div>
                    <a href="#" className="sidebar-icon">
                        <BsLayoutSidebar />
                    </a>
                </div>
            </div>
            <div>
                <nav className="left-sidebar-list">
                    <h6>ALPHA WHALES</h6>
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/')}
                                style={{ cursor: 'pointer' }}
                            >
                            <FontAwesomeIcon icon={faChartLine}/>    ALPHA STREAM
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/top-kol-coins') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/top-kol-coins')}
                                style={{ cursor: 'pointer' }}
                            >
                             <FontAwesomeIcon icon={faCoins}/>   Top KOL Coins
                            </a>
                        </li>
                    </ul>
                </nav>
                <nav className="left-sidebar-list">
                    <h6>Influencer Intel</h6>
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/kol') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/kol')}
                                style={{ cursor: 'pointer' }}
                            >
                             <FontAwesomeIcon icon={faRss}/>    KOL FEED
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/all-kol-coins') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/all-kol-coins')}
                                style={{ cursor: 'pointer' }}
                            >
                              <FontAwesomeIcon icon={faRankingStar}/>   top KOL COINS
                            </a>
                        </li>
                    </ul>
                </nav>
                <nav className="left-sidebar-list">
                    <h6>Alpha Insights</h6>
                    <ul className="nav-list">
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/whale-leaderboard') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/whale-leaderboard')}
                                style={{ cursor: 'pointer' }}
                            >
                              <FontAwesomeIcon icon={faCrown}/>  whales leaderboard
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/signal-engine') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/signal-engine')}
                                style={{ cursor: 'pointer' }}
                            >
                               <FontAwesomeIcon icon={faSatelliteDish}/>   signal engine
                            </a>
                        </li>
                        <li className="nav-item-bar">
                            <a
                                className={`nav-link-item ${isActive('/subscription') ? 'nav-active' : ''}`}
                                onClick={() => navigate('/subscription')}
                                style={{ cursor: 'pointer' }}
                            >
                               <FontAwesomeIcon icon={faStar}/>   Subscription
                            </a>
                        </li>
                    </ul>
                </nav>
                <div className="nav-btm-item">
                    <ul className="nav-btm-list">
                        <li><a className="nav-btm-link" href="https://t.me/alphablock" target="_blank" rel="noopener noreferrer">telegram</a></li>
                        <li><span className="nw-slash">/</span></li>
                        <li><a className="nav-btm-link" href="https://x.com/alphablock" target="_blank" rel="noopener noreferrer">x.com</a></li>
                    </ul>
                    <p>© 2025 AlphaBlock AI, All Rights Reserved.</p>
                </div>
            </div>
        </aside>
       </>
    )
}

export default Sidebar
