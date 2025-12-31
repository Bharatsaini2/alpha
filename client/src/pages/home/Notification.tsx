import { FaRegCopy } from "react-icons/fa6"
import "../../css/KolFeedPortfolio.css"
import { useState } from "react"
import { HiChevronUpDown } from "react-icons/hi2"
import { TfiReload } from "react-icons/tfi"
import { faArrowRotateBack } from "@fortawesome/free-solid-svg-icons"

function Notification() {
  const [activeTab, setActiveTab] = useState("portfolio")

  return (
    <>
      <section>
       <div className="row">
        <div className="col-lg-12">
             <div className="last-refreshed-bx mb-2">
                            <h6>Last refreshed: <span className="refresh-title">21s</span></h6>
                            <a href="javscript:void(0)" className="refresh-btn"> <FontAwesomeIcon icon={faArrowRotateBack} /> Refresh</a>
                        </div>
        </div>

       </div>

        <div className="row">
          <div className="col-lg-12">
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
            <div className="tab-content custom-tab-content mt-3">
              {activeTab === "portfolio" && (
                <div className="tab-pane active">
                  <div className="table-responsive crypto-table-responsive">
                    <table className="table crypto-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>
                            <span className="kol-feed-table-title">
                              asset <HiChevronUpDown />
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              {" "}
                              Price <HiChevronUpDown />
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              holding <HiChevronUpDown />
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              {" "}
                              Value <HiChevronUpDown />
                            </span>
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
              )}

              {activeTab === "trades" && (
                <div className="tab-pane active">
                  <div className="table-responsive crypto-table-responsive">
                    <table className="table crypto-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>
                            <span className="kol-feed-table-title">
                              Type <HiChevronUpDown />{" "}
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              Token <HiChevronUpDown />{" "}
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title justify-between">
                              <span className="d-flex align-items-center">
                                Market cap <HiChevronUpDown />{" "}
                              </span>
                              <a
                                href="javascript:void(0)"
                                className=" usd-reload-btn"
                              >
                                <TfiReload />
                              </a>{" "}
                            </span>{" "}
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              amount <HiChevronUpDown />
                            </span>{" "}
                          </th>
                          <th>
                            <span className="kol-feed-table-title justify-between">
                              <span className="d-flex align-items-center">
                                total <HiChevronUpDown />
                              </span>{" "}
                              <a
                                href="javascript:void(0)"
                                className=" usd-reload-btn"
                              >
                                {" "}
                                usd <TfiReload />
                              </a>{" "}
                            </span>
                          </th>
                          <th>
                            {" "}
                            <span className="kol-feed-table-title">
                              PnL <HiChevronUpDown />{" "}
                            </span>
                          </th>
                          <th>
                            <span className="kol-feed-table-title">
                              age <HiChevronUpDown />{" "}
                            </span>
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          <td>
                            <span className="up-trade">BUY</span>
                          </td>
                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/file-one.png" alt="" />
                              </span>
                              FILECOIN
                              <span className="">
                                <button className="kol-cp-btn">
                                  {" "}
                                  <FaRegCopy />{" "}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$1.5B</td>
                          <td>10</td>
                          <td>$100</td>
                          <td className="value-up-title">+ $2,000 (+12%)</td>
                          <td>
                            <span className="age-title">1h ago</span>
                          </td>
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
                                <button className="kol-cp-btn">
                                  {" "}
                                  <FaRegCopy />{" "}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$1.5B</td>
                          <td>10</td>
                          <td>$100</td>
                          <td className="value-down-title">+ $2,000 (+12%)</td>
                          <td>
                            <span className="age-title">1h ago</span>
                          </td>
                        </tr>

                        <tr>
                          <td>
                            <span className="up-trade">Buy</span>
                          </td>

                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-2.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  {" "}
                                  <FaRegCopy />{" "}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$1.5B</td>
                          <td>10</td>
                          <td>$100</td>
                          <td className="value-up-title">+ $2,000 (+12%)</td>
                          <td>
                            <span className="age-title">1h ago</span>
                          </td>
                        </tr>

                        <tr>
                          <td>
                            <span className="down-trade">sell</span>
                          </td>

                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-3.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  {" "}
                                  <FaRegCopy />{" "}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$1.5B</td>
                          <td>10</td>
                          <td>$100</td>
                          <td className="value-up-title">+ $2,000 (+12%)</td>
                          <td>
                            <span className="age-title">1h ago</span>
                          </td>
                        </tr>

                        <tr>
                          <td>
                            <span className="down-trade">sell</span>
                          </td>

                          <td>
                            <div className="coin-cell">
                              <span className="coin-icon">
                                <img src="/t-6.png" alt="" />
                              </span>
                              ETHEREUM
                              <span className="">
                                <button className="kol-cp-btn">
                                  {" "}
                                  <FaRegCopy />{" "}
                                </button>
                              </span>
                            </div>
                          </td>
                          <td>$1.5B</td>
                          <td>10</td>
                          <td>$100</td>
                          <td className="value-up-title">+ $2,000 (+12%)</td>
                          <td>
                            <span className="age-title">1h ago</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="alpha-powered-by-table">
                      <p>powered by alpha blocks ai</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Notification
