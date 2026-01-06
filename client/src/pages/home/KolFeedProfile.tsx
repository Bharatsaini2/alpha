import { RiVerifiedBadgeFill } from "react-icons/ri"
import { FaXTwitter } from "react-icons/fa6"
import { FaRegCopy } from "react-icons/fa6"
import { FaStar } from "react-icons/fa"
import "../../css/KolFeedPortfolio.css"
import { useState } from "react"
import { HiChevronUpDown } from "react-icons/hi2"
import { TfiReload } from "react-icons/tfi"

function KolFeedProfile() {
  const [activeTab, setActiveTab] = useState("portfolio")

  return (
    <>
      <section>
        <div className="row">
          <div className="col-lg-5 col-md-5 col-sm-12 new-mobile-spacing">
            <div className="alpha-profile-card nw-portfolio-card mb-3">
              <div className="alpha-profile-title-bx portfolio-tp-bx">
                <div>
                  <h6>Profile</h6>
                </div>
              </div>

              <div className="alpha-profile-content">
                <div className="alpha-profile-user-bx">
                  <div className="alpha-user-details">
                    <img src="/pic.png" alt="" />
                    <div>
                      <h4>
                        CRYPTOMASTER69 <RiVerifiedBadgeFill />
                      </h4>
                      <button className="telegram-share-btn">
                        <FaXTwitter style={{ color: "#EBEBEB" }} /> @crypt
                      </button>
                      <div className="nw-user-info-bx">
                        <div>
                          <h6 className="">wallet address</h6>
                          <p>
                            7vfCXTUX...voxs
                            <a
                              href="javascript:void(0)"
                              className="kol-copy-btn"
                              style={{ color: "#8F8F8F" }}
                            >
                              
                              <FaRegCopy />
                            </a>
                          </p>
                        </div>
                        <div>
                          <button className="subscribe-btn">
                            subscribed <FaStar />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-7 col-md-7 col-sm-12 new-mobile-spacing">
            <div className="alpha-total-value-bx nw-portfolio-card mobile-portfolio-tatol-crd">
              <div className="total-value-content">
                <h6>Total Value</h6>

                <h4>$62,000</h4>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-lg-12 new-mobile-spacing">
            {/* Tabs */}
            <div className="d-flex portfolio-tab-container">
              <ul className="nav nav-tabs custom-tabs">
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "portfolio" ? "active" : ""}`}
                    onClick={() => setActiveTab("portfolio")}
                  >
                    portfolio
                  </button>
                </li>

                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "trades" ? "active" : ""}`}
                    onClick={() => setActiveTab("trades")}
                  >
                    recent trades
                  </button>
                </li>
              </ul>
            </div>

            {/* Content */}
            <div className="tab-content custom-tab-content mt-lg-3 mt-sm-0">
              {activeTab === "portfolio" && (
                <>
                <div className="tab-pane active desktop-tab-panel">
                  <div className="table-responsive crypto-table-responsive">
                    <table className="table crypto-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>
                            <span className="kol-feed-table-title">asset <HiChevronUpDown /></span>
                          </th>
                          <th>
                           <span className="kol-feed-table-title"> Price <HiChevronUpDown /></span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">holding <HiChevronUpDown /></span>
                          </th>
                          <th>
                           <span className="kol-feed-table-title"> Value <HiChevronUpDown /></span>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/file-one.png" alt="" />
                              </span>
                              FILECOIN
                              <span className="">
                                <button className="kol-cp-btn">
                                  
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$800</td>
                          <td>10</td>
                          <td className="value-up-title">+ $2,000 (+12%)</td>
                        </tr>

                        <tr>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon ">
                                <img src="/t-4.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$800</td>
                          <td>10</td>
                          <td>
                            <span className="value-up-title">
                              
                              + $2,000 (+12%)
                            </span>
                          </td>
                        </tr>

                        <tr>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-2.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$800</td>
                          <td>10</td>
                          <td>
                            <span className="value-up-title">
                              
                              + $2,000 (+12%)
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-3.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$800</td>
                          <td>10</td>
                          <td>
                            <span className="value-up-title">
                              
                              + $2,000 (+12%)
                            </span>
                          </td>
                        </tr>

                        <tr>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-6.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  
                                  <FaRegCopy />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$800</td>
                          <td>10</td>
                          <td>
                            <span className="value-down-title">
                              
                              + $2,000 (+12%)
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="alpha-powered-by-table">
                      <p>powered by alpha blocks ai</p>
                    </div>
                  </div>
                </div>

               <div>
                 <div className="mobile-new-table">
                  <div className="crypto-box">
                  <div className="crypto-row crypto-head">
                    <div className="crypto-left">
                      <span className="crypto-title">ASSET</span>
                    </div>

                    <div className="crypto-right crypto-asset">
                      <img src="solana-icon.png" className="crypto-logo" alt="Solana" />
                      <span className="crypto-name">SOLANA</span>
                      <span className="crypto-copy"> <button className="kol-cp-btn"> <FaRegCopy /> </button></span>
                    </div>
                  </div>


                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">PRICE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$800</span>
                    </div>
                  </div>
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">HOLDING</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">10</span>
                    </div>
                  </div>

              
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">VALUE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-profit">+ $2,000 (+12%)</span>
                    </div>
                  </div>
                </div>
              </div>

                <div className="mobile-new-table">
                  <div className="crypto-box">
                  <div className="crypto-row crypto-head">
                    <div className="crypto-left">
                      <span className="crypto-title">ASSET</span>
                    </div>

                    <div className="crypto-right crypto-asset">
                      <img src="/t-3.png" className="crypto-logo" alt="Solana" />
                      <span className="crypto-name">Filecoin</span>
                      <span className="crypto-copy"> <button className="kol-cp-btn"> <FaRegCopy /> </button></span>
                    </div>
                  </div>


                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">PRICE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$1.2</span>
                    </div>
                  </div>
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">HOLDING</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">25</span>
                    </div>
                  </div>

              
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">VALUE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="value-down-title">+ $2,200 (+5%)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mobile-new-table">
                  <div className="crypto-box">
                  <div className="crypto-row crypto-head">
                    <div className="crypto-left">
                      <span className="crypto-title">ASSET</span>
                    </div>

                    <div className="crypto-right crypto-asset">
                      <img src="/t-6.png" className="crypto-logo" alt="Solana" />
                      <span className="crypto-name">ethereum</span>
                      <span className="crypto-copy"> <button className="kol-cp-btn"> <FaRegCopy /> </button></span>
                    </div>
                  </div>


                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">PRICE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$1,800</span>
                    </div>
                  </div>
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">HOLDING</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">125</span>
                    </div>
                  </div>

              
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">VALUE</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-profit">+ $2,500 (+6%)</span>
                    </div>
                  </div>
                </div>
              </div>
             <div className="mobile-block">
                      <p>powered by alpha blocks ai</p>
                </div>
               </div>


                </>


              )}

              {activeTab === "trades" && (

                <>
                 <div className="tab-pane active desktop-tab-panel">
                  <div className="table-responsive crypto-table-responsive">
                                        <table className="table crypto-table align-middle mb-0">
                                            <thead>
                                                <tr>

                                                    <th><span className="kol-feed-table-title">Type <HiChevronUpDown /> </span></th>
                                                    <th><span className="kol-feed-table-title">Token <HiChevronUpDown /> </span></th>
                                                    <th><span className="kol-feed-table-title justify-between"><span className="d-flex align-items-center">Market cap <HiChevronUpDown /> </span><a href="javascript:void(0)" className=" usd-reload-btn"><TfiReload /></a>  </span> </th>
                                                    <th><span className="kol-feed-table-title">amount <HiChevronUpDown /></span> </th>
                                                    <th><span className="kol-feed-table-title justify-between"><span className="d-flex align-items-center">total <HiChevronUpDown /></span> <a href="javascript:void(0)" className=" usd-reload-btn"> usd <TfiReload /></a> </span></th>
                                                    <th> <span className="kol-feed-table-title">PnL <HiChevronUpDown /> </span></th>
                                                    <th><span className="kol-feed-table-title">age <HiChevronUpDown /> </span></th>

                                                </tr>
                                            </thead> 

                                            <tbody>

                                                <tr>
                                                    <td>
                                                        <span className="up-trade">BUY</span>
                                                    </td>
                                                    <td >

                                                        <div className="coin-cell">
                                                            <span className="coin-icon">
                                                                <img src="/file-one.png" alt="" />
                                                            </span>
                                                            FILECOIN
                                                            <span className="">
                                                                <button className="kol-cp-btn"> <FaRegCopy /> </button>
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>$1.5B</td>
                                                    <td>10</td>
                                                    <td>$100</td>
                                                    <td className="value-up-title">+ $2,000 (+12%)</td>
                                                    <td><span className="age-title">1h ago</span></td>

                                                </tr>


                                                <tr>
                                                    <td>
                                                        <span className="down-trade">sell</span>
                                                    </td>
                                                    <td>
                                                        <div className="coin-cell">
                                                            <span className="coin-icon ">
                                                                <img src="/t-4.png" alt="" />
                                                            </span>
                                                            ETHEREUM
                                                            <span className="">
                                                                <button className="kol-cp-btn"> <FaRegCopy /> </button>
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>$1.5B</td>
                                                    <td>10</td>
                                                    <td>$100</td>
                                                    <td className="value-down-title">+ $2,000 (+12%)</td>
                                                    <td><span className="age-title">1h ago</span></td>
                                                </tr>


                                                <tr>
                                                    <td>
                                                        <span className="up-trade">Buy</span>
                                                    </td>

                                                    <td >
                                                        <div className="coin-cell">
                                                            <span className="coin-icon">
                                                                <img src="/t-2.png" alt="" />
                                                            </span>
                                                            ETHEREUM
                                                            <span className="">
                                                                <button className="kol-cp-btn"> <FaRegCopy /> </button>
                                                            </span>
                                                        </div>

                                                    </td>
                                                    <td>$1.5B</td>
                                                    <td>10</td>
                                                    <td>$100</td>
                                                    <td className="value-up-title">+ $2,000 (+12%)</td>
                                                    <td><span className="age-title">1h ago</span></td>
                                                </tr>

                                                <tr>
                                                    <td>
                                                        <span className="down-trade">sell</span>
                                                    </td>


                                                    <td >

                                                        <div className="coin-cell">
                                                            <span className="coin-icon">
                                                                <img src="/t-3.png" alt="" />
                                                            </span>
                                                            ETHEREUM
                                                            <span className="">
                                                                <button className="kol-cp-btn"> <FaRegCopy /> </button>
                                                            </span>
                                                        </div>


                                                    </td>
                                                    <td>$1.5B</td>
                                                    <td>10</td>
                                                    <td>$100</td>
                                                    <td className="value-up-title">+ $2,000 (+12%)</td>
                                                    <td><span className="age-title">1h ago</span></td>
                                                </tr>




                                                <tr>
                                                    <td>
                                                        <span className="down-trade">sell</span>
                                                    </td>

                                                    <td >

                                                        <div className="coin-cell">
                                                            <span className="coin-icon">
                                                                <img src="/t-6.png" alt="" />
                                                            </span>
                                                            ETHEREUM
                                                            <span className="">
                                                                <button className="kol-cp-btn"> <FaRegCopy /> </button>
                                                            </span>
                                                        </div>


                                                    </td>
                                                    <td>$1.5B</td>
                                                    <td>10</td>
                                                    <td>$100</td>
                                                    <td className="value-up-title">+ $2,000 (+12%)</td>
                                                    <td><span className="age-title">1h ago</span></td>
                                                </tr>




                                            </tbody>
                                        </table>
                                        <div className="alpha-powered-by-table">
                                            <p>powered by alpha blocks ai</p>
                                        </div>
                    </div>
                </div>

                <div>
                 <div className="mobile-new-table">
                  <div className="crypto-box">

                     <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">type</span>
                    </div>

                    <div className="crypto-right">
                      <span className="up-trade">BUY</span>
                    </div>
                  </div>


                  <div className="crypto-row crypto-head">
                    <div className="crypto-left">
                      <span className="crypto-title">token</span>
                    </div>

                    <div className="crypto-right crypto-asset">
                      <img src="solana-icon.png" className="crypto-logo" alt="Solana" />
                      <span className="crypto-name">SOLANA</span>
                      <span className="crypto-copy"> <button className="kol-cp-btn"> <FaRegCopy /> </button></span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title d-flex gap-1">market cap <a href="javascript:void(0)" className=" usd-reload-btn"><TfiReload /></a></span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$1.5B</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">amount</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">10</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title d-flex gap-1">total  <a href="javascript:void(0)" className=" usd-reload-btn"> usd <TfiReload /></a></span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$100</span>
                    </div>
                  </div>

              
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">pnl</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-profit">+ $2,000 (+12%)</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">age</span>
                    </div>

                    <div className="crypto-right">
                      <span className="age-ago-data">1h ago</span>
                    </div>
                  </div>

                  

                </div>
                  </div>


                 <div className="mobile-new-table">
                  <div className="crypto-box">

                     <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">type</span>
                    </div>

                    <div className="crypto-right">
                      <span className="down-trade">BUY</span>
                    </div>
                  </div>


                  <div className="crypto-row crypto-head">
                    <div className="crypto-left">
                      <span className="crypto-title">token</span>
                    </div>

                    <div className="crypto-right crypto-asset">
                      <img src="solana-icon.png" className="crypto-logo" alt="Solana" />
                      <span className="crypto-name">ethereum</span>
                      <span className="crypto-copy"> <button className="kol-cp-btn"> <FaRegCopy /> </button></span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title d-flex gap-1">market cap <a href="javascript:void(0)" className=" usd-reload-btn"><TfiReload /></a></span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$1.5B</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">amount</span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">10</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title d-flex gap-1">total  <a href="javascript:void(0)" className=" usd-reload-btn"> usd <TfiReload /></a></span>
                    </div>

                    <div className="crypto-right">
                      <span className="crypto-data">$100</span>
                    </div>
                  </div>

              
                  <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">pnl</span>
                    </div>

                    <div className="crypto-right">
                      <span className="value-down-title">+ $2,000 (+12%)</span>
                    </div>
                  </div>

                   <div className="crypto-row">
                    <div className="crypto-left">
                      <span className="crypto-title">age</span>
                    </div>

                    <div className="crypto-right">
                      <span className="age-ago-data">1h ago</span>
                    </div>
                  </div>

                  

                </div>
                </div>

               
              <div className="mobile-block">
                      <p>powered by alpha blocks ai</p>
                </div>
               </div>

                </>


               
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default KolFeedProfile
