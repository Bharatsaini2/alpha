"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HiChevronDown, HiChevronUp, HiChevronUpDown } from "react-icons/hi2";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { FaRegCopy } from "react-icons/fa6";
import { IoChevronBack, IoChevronDown, IoChevronForward } from "react-icons/io5";
import { TfiReload } from "react-icons/tfi";
import ReactApexChart from "react-apexcharts";


function TopKolCoins() {
    const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

    const toggleRow = (rowId: string | number) => {
        const key = String(rowId);

        setOpenRows((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const [activeView, setActiveView] = useState('table');

    const handleViewChange = (view) => {
        setActiveView(view);
    };

    const [openRow, setOpenRow] = useState(null);
    const [activeChartTab, setActiveChartTab] = useState('overview');

    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState(10);



    const series: ApexOptions["series"] = [
        {
            name: "Net Inflow",
            type: "column",
            data: [80, 200, 100, 30, 400],
        },
        {
            name: "Whale Count",
            type: "line",
            data: [3, 1, 4, 2, 1],
        },
    ];

    const newSeries: ApexOptions["series"] = [
        {
            name: "Net Outflow",
            type: "column",
            data: [80, 200, 100, 30, 400],
        },
        {
            name: "Whale Count",
            type: "line",
            data: [3, 1, 4, 2, 1],
        },
    ];

    /* ===================== OPTIONS ===================== */

    const options: ApexOptions = {
        chart: {
            height: 420,
            type: "line",
            background: "transparent",
            toolbar: { show: false },
        },
        theme: { mode: "dark" },
        stroke: { width: [0, 2], curve: "straight" },
        plotOptions: {
            bar: { columnWidth: "40%", borderRadius: 0 },
        },
        markers: {
            size: 6,
            colors: ["#ffffff"],
            strokeColors: "#ffffff",
            hover: { size: 7 },
        },
        colors: ["#14904D", "#ffffff"],
        dataLabels: { enabled: false },
        xaxis: {
            categories: ["FWOG ", "TETSUO", "LMAO!", "QST", "SPSC"],
            labels: {
                style: { colors: "#FBFAF9", fontSize: "14px", fontWeight: 300 },
            },
            axisBorder: { color: "#333" },
            axisTicks: { color: "#333" },
        },
        yaxis: [
            {
                title: {
                    text: "NET INFLOW (THOUSANDS USD)",
                    style: { color: "#cbd5e1", fontWeight: 500 },
                },
                labels: {
                    formatter: (val: number) => `${val}K ($)`,
                    style: { colors: "#cbd5e1" },
                },
            },
            {
                opposite: true,
                title: {
                    text: "WHALE COUNT",
                    style: { color: "#cbd5e1", fontWeight: 500 },
                },
                labels: { style: { colors: "#cbd5e1" } },
            },
        ],
        grid: { borderColor: "#333", strokeDashArray: 4 },
        legend: {
            position: "top",
            horizontalAlign: "center",
            labels: { colors: "#e5e7eb" },
        },

        tooltip: { theme: "dark" },
    };

    const newOptions: ApexOptions = {
        ...options,
        colors: ["#DF2A4E", "#ffffff"],

        yaxis: [
            {
                title: {
                    text: "NET OUTFLOW (THOUSANDS USD)",
                    style: { fontSize: "12px", color: "#DF2A4E", fontWeight: 500, fontFamily: "Geist Mono, monospace" },
                },
                labels: {
                    formatter: (val: number) => `${val}K ($)`,
                    style: { colors: "#cbd5e1" },
                },
            },
            {
                opposite: true,
                title: {
                    text: "WHALE COUNT",
                    style: { fontSize: "12px", color: "#FFFFFF", fontWeight: 500, fontFamily: "Geist Mono, monospace" },
                },
                labels: { style: { colors: "#cbd5e1" } },
            },
        ],
    };

    return (
        <>
            <section className="">
                <div className="row">
                    <div className="col-lg-12">
                        <div className="last-refreshed-bx mb-2">
                            <h6>Last refreshed: <span className="refresh-title">21s</span></h6>
                            <a href="javscript:void(0)" className="refresh-btn"> <TfiReload className="reload-btn" /> Refresh</a>
                        </div>

                        <div className="d-flex align-items-center justify-content-between gap-2 coin-mb-container">

                             <div className="d-flex align-items-center gap-3">
                            <ul className="nav nav-tabs custom-tabs" role="tablist">
                                <li className="nav-item">
                                    <a
                                        className={`nav-link ${activeView === 'table' ? 'active' : ''}`}
                                        onClick={() => setActiveView('table')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        Table View
                                    </a>
                                </li>

                                <li className="nav-item">
                                    <a
                                        className={`nav-link ${activeView === 'chart' ? 'active' : ''}`}
                                        onClick={() => {
                                            setActiveView('chart');
                                            setActiveChartTab('inflow'); // 🔥 auto active
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        Chart View
                                    </a>
                                </li>
                            </ul>

                            {activeView === 'chart' && (
                                <ul className="nav nav-tabs custom-tabs chart-sub-tabs">
                                    <li className="nav-item">
                                        <a
                                            className={`nav-link ${activeChartTab === 'inflow' ? 'active' : ''}`}
                                            onClick={() => setActiveChartTab('inflow')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Inflow
                                        </a>
                                    </li>

                                    <li className="nav-item">
                                        <a
                                            className={`nav-link ${activeChartTab === 'outflow' ? 'active' : ''}`}
                                            onClick={() => setActiveChartTab('outflow')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Outflow
                                        </a>
                                    </li>
                                </ul>
                            )}
                        </div>


                           <div className="d-flex align-items-center gap-2">
                             <div className="custom-frm-bx mb-0">
                                <input type="text" className="form-control pe-5" placeholder="Search" />
                                <div className="searching-bx">
                                    <button className="search-btn"> <FontAwesomeIcon icon={faSearch} /> </button>
                                </div>
                            </div>

                            <div className="d-flex align-items-center gap-3 market-container">
                                <div>
                                    <a href="javascript:void(0)" className="plan-btn">Market Cap  <HiChevronUpDown /></a>
                                </div>

                                <div className="time-filter">
                                    <a href="#" className="time-item active">4H</a>
                                    <span className="divider">|</span>
                                    <a href="#" className="time-item">12H</a>
                                    <span className="divider">|</span>
                                    <a href="#" className="time-item">24H</a>
                                    <span className="divider">|</span>
                                    <a href="#" className="time-item">1W</a>
                                </div>
                            </div>
                           </div>

                        </div>


                        {/* <div className="d-flex align-items-center gap-3">
                            <ul className="nav nav-tabs custom-tabs" role="tablist">
                                <li className="nav-item">
                                    <a
                                        className={`nav-link ${activeView === 'table' ? 'active' : ''}`}
                                        onClick={() => setActiveView('table')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        Table View
                                    </a>
                                </li>

                                <li className="nav-item">
                                    <a
                                        className={`nav-link ${activeView === 'chart' ? 'active' : ''}`}
                                        onClick={() => {
                                            setActiveView('chart');
                                            setActiveChartTab('inflow'); // 🔥 auto active
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        Chart View
                                    </a>
                                </li>
                            </ul>

                            {activeView === 'chart' && (
                                <ul className="nav nav-tabs custom-tabs chart-sub-tabs">
                                    <li className="nav-item">
                                        <a
                                            className={`nav-link ${activeChartTab === 'inflow' ? 'active' : ''}`}
                                            onClick={() => setActiveChartTab('inflow')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Inflow
                                        </a>
                                    </li>

                                    <li className="nav-item">
                                        <a
                                            className={`nav-link ${activeChartTab === 'outflow' ? 'active' : ''}`}
                                            onClick={() => setActiveChartTab('outflow')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            Outflow
                                        </a>
                                    </li>
                                </ul>
                            )}
                        </div> */}



                        <div className="tab-content custom-tab-content">
                            {activeView === 'table' && (
                                <div className="table-responsive crypto-table-responsive crypto-sub-table-responsive">
                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                        <thead>
                                            <tr>
                                                <th className="expand-col"></th>
                                                <th>
                                                    <div className="coin-th-title">RANK <span><HiChevronUpDown /> </span> </div>
                                                </th>
                                                <th> <div className="coin-th-title"> COIN <span><HiChevronUpDown /> </span></div></th>
                                                <th><div className="coin-th-title">NET INFLOW <span><HiChevronUpDown /> </span></div></th>
                                                <th><div className="coin-th-title">WHALE <span><HiChevronUpDown /></span> </div></th>
                                                <th><div className="coin-th-title">MARKET CAP  </div></th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 1 ? null : 1)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 1 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#1</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/file-one.png" alt="" />
                                                        </span>
                                                        FILECOIN
                                                        <span className="">

                                                            <button className="tb-cpy-btn">  <FaRegCopy /> </button>
                                                        </span>
                                                    </div>
                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>2</td>
                                                <td>$100.2</td>
                                            </tr>

                                            {openRow === 1 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle crypto-sub-table mb-0">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>
                                            )}


                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 2 ? null : 2)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 2 ? <HiChevronUp /> : <HiChevronDown />}

                                                </td>
                                                <td>#2</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon ">
                                                            <img src="/t-4.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>


                                            {openRow === 2 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>
                                            )}

                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 3 ? null : 3)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 3 ? <HiChevronUp /> : <HiChevronDown />}

                                                </td>
                                                <td>#3</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-2.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 3 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>

                                            )}

                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 4 ? null : 4)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 4 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#4</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-3.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>
                                            {openRow === 4 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>

                                            )}

                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 5 ? null : 5)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 5 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#5</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-6.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 5 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">
                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}

                                            <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 6 ? null : 6)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 6 ? <HiChevronUp /> : <HiChevronDown />}

                                                </td>
                                                <td>#6</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon ">
                                                            <img src="/t-4.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 6 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>
                                            )}

                                             <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 7 ? null : 7)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 7 ? <HiChevronUp /> : <HiChevronDown />}

                                                </td>
                                                <td>#7</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-2.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 7 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>

                                            )}

                                             <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 8 ? null : 8)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 8 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#8</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-3.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>
                                            {openRow === 8 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">

                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </td>
                                                </tr>

                                            )}


                                             <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 9 ? null : 9)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 9 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#9</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-6.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 9 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">
                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}


                                             <tr
                                                className="main-row"
                                                onClick={() =>
                                                    setOpenRow(openRow === 10 ? null : 10)
                                                }
                                            >
                                                <td className="expand-col">
                                                    {openRow === 10 ? <HiChevronUp /> : <HiChevronDown />}
                                                </td>
                                                <td>#10</td>
                                                <td >
                                                    <div className="coin-cell">
                                                        <span className="coin-icon">
                                                            <img src="/t-6.png" alt="" />
                                                        </span>
                                                        ETHEREUM
                                                        <span className="">
                                                            <button className="tb-cpy-btn"> <FaRegCopy /> </button>
                                                        </span>
                                                    </div>

                                                </td>
                                                <td >
                                                    <span className="sold-title">+ $100.2</span></td>
                                                <td>3</td>
                                                <td>$150.7</td>
                                            </tr>

                                            {openRow === 10 && (
                                                <tr className="expand-row">
                                                    <td colSpan={6} className="p-0">
                                                        <div className="nw-expand-table-data">
                                                            <div className="expand-empty-box"></div>
                                                            <div className="flex-grow-1">
                                                                <div className="expand-tp-title">
                                                                    <p>whale ACTIVITY last 24h</p>
                                                                </div>

                                                                <div className="nw-whale-parent-bx">

                                                                    <div className="whale-card-wrap">

                                                                        <div className="whale-card-header">
                                                                            <div className="whale-card-icon">
                                                                                <img src="/file-second.png" alt="ETH" />
                                                                            </div>

                                                                            <div className="whale-card-info">
                                                                                <h4 className="whale-card-title">ETHEREUM</h4>
                                                                                <p className="whale-card-symbol">$ETH</p>

                                                                                <div className="whale-card-address">
                                                                                    <span className="whale-crd-title">7vfcXTUX...voxs</span>
                                                                                    <button className="whale-copy-btn">
                                                                                        <FaRegCopy />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>


                                                                        <div className="whale-quick-buy">
                                                                            QUICK BUY
                                                                        </div>


                                                                        <div className="whale-stats-box">
                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL BUYS:</span>
                                                                                <p className="whale-stat-value green">+45.77K <span className="whale-stat-title">(99)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-label">TOTAL SELLS:</span>
                                                                                <p className="whale-stat-value red">-30.69K <span className="whale-stat-title">(69)</span></p>
                                                                            </div>

                                                                            <div className="whale-stat-divider"></div>

                                                                            <div className="whale-stat-row">
                                                                                <span className="whale-stat-net">NET INFLOW:</span>
                                                                                <p className="whale-stat-value green">20.17K <span className="whale-stat-title">(30)</span></p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <table className="table crypto-table align-middle mb-0 crypto-sub-table">
                                                                        <thead>
                                                                            <tr>

                                                                                <th> <div className="coin-th-title"> Type <span> <HiChevronUpDown /></span></div>   </th>
                                                                                <th> <div className="coin-th-title"> maker <span><HiChevronUpDown /> </span> </div>  </th>
                                                                                <th> <div className="coin-th-title">usd <span><HiChevronUpDown /> </span>  </div> </th>
                                                                                <th> <div className="coin-th-title"> market cap <span><HiChevronUpDown /></span>  </div>   </th>

                                                                            </tr>

                                                                        </thead>

                                                                        <tbody>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="sell-bazar">sell </span>
                                                                                        <span className="sold-out-title">12s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-out-title">12s</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>
                                                                            <tr>

                                                                                <td>
                                                                                    <div className="d-flex align-items-center gap-1">
                                                                                        <span className="buy-bazar">BUY </span>
                                                                                        <span className="sold-title ">5s</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    Big Launchcoin Whale <span className="whale-marker-title">(3a6...)</span>
                                                                                </td>
                                                                                <td>
                                                                                    <span className="sold-title ">$5,000</span>
                                                                                </td>
                                                                                <td>1.6m</td>

                                                                            </tr>

                                                                        </tbody>

                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}



                                        </tbody>
                                    </table>

                                    <div className="crypto-pagination-wrap">
                                        <div className="crypto-page-info">
                                            <p>Showing 1-10 out of 35</p>
                                        </div>
                                        <div className="crypto-page-controls">
                                            <div className="crypto-page-size position-relative">
                                                    <button
                                                        className="crypto-page-btn"
                                                        onClick={() => setOpen(!open)}
                                                    >
                                                        SHOW ROWS
                                                        <span className="show-row-title">
                                                        {rows} <IoChevronDown />
                                                        </span>
                                                    </button>

                                                    {open && (
                                                        <ul className="crypto-page-dropdown">
                                                        {[10, 20, 50].map((val) => (
                                                            <li key={val}>
                                                            <button
                                                                className="dropdown-item"
                                                                onClick={() => {
                                                                setRows(val);
                                                                setOpen(false);
                                                                }}
                                                            >
                                                                {val}
                                                            </button>
                                                            </li>
                                                        ))}
                                                        </ul>
                                                    )}
                                                    </div>



                                            <nav>
                                                <ul className="pagination crypto-pagination mb-0">
                                                    <li className="page-item">
                                                        <button className="page-link crypto-page-btn"><IoChevronBack />
                                                            PREVIOUS</button>
                                                    </li>

                                                    <li className="page-item active">
                                                        <button className="page-link crypto-page-btn">1</button>
                                                    </li>
                                                    <li className="page-item">
                                                        <button className="page-link crypto-page-btn">2</button>
                                                    </li>
                                                    <li className="page-item">
                                                        <button className="page-link crypto-page-btn">3</button>
                                                    </li>

                                                    <li className="page-item ">
                                                        <span className="page-link crypto-page-btn">…</span>
                                                    </li>

                                                    <li className="page-item">
                                                        <button className="page-link crypto-page-btn">5</button>
                                                    </li>

                                                    <li className="page-item">
                                                        <button className="page-link crypto-page-btn">NEXT <IoChevronForward /></button>
                                                    </li>
                                                </ul>
                                            </nav>

                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        <div className="chart-tab-content mt-3">
                            {activeView === 'chart' && activeChartTab === 'inflow' && (
                                <div >
                                    <div className="inflow-title">
                                        <h4>Whale Net Inflow with Whale Count</h4>
                                    </div>
                                    <div className="chart-container" >
                                        <span className="corner top-right"></span>
                                        <span className="corner bottom-left"></span>

                                        <ReactApexChart
                                            options={options}
                                            series={series}
                                            type="line"
                                            height={420}
                                        />


                                    </div>
                                </div>
                            )}

                            {activeView === 'chart' && activeChartTab === 'outflow' && (

                                <div>
                                    <div className="inflow-title">
                                        <h4>Whale Net outflow with Whale Count</h4>
                                    </div>
                                    <div className="chart-container">
                                        <span className="corner top-right"></span>
                                        <span className="corner bottom-left"></span>

                                        <ReactApexChart
                                            options={newOptions}
                                            series={newSeries}
                                            type="line"
                                            height={420}
                                        />
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

export default TopKolCoins