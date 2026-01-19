import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';

interface KOLAlertPopupProps {
    hotness: number;
    setHotness: (value: number) => void;
    amount: string;
    setAmount: (value: string) => void;
    onActivate: () => void;
    isSaved: boolean;
    setIsSaved: (value: boolean) => void;
    user: any;
}

const KOLAlertPopup: React.FC<KOLAlertPopupProps> = ({
    hotness,
    setHotness,
    amount,
    setAmount,
    onActivate,
    isSaved,
    setIsSaved,
    user
}) => {
    const [triggerOpen, setTriggerOpen] = useState(false);
    const [amountOpen, setAmountOpen] = useState(false);
    const [customAmount, setCustomAmount] = useState("");

    return (
        <div className="filter-dropdown-menu w-sm filter-mobile-subscription" onClick={(e) => e.stopPropagation()}>
            {!isSaved && (
                <div className="parent-dropdown-content">
                    <div className="sub-drop-header">
                        <div className="sub-drop-content">
                            <h6>System Config</h6>
                            <h4>KOL Feed Alerts</h4>
                        </div>

                        <div>
                            <button
                                className="paper-plan-connect-btn"
                                disabled // purely visual in the reference, but we can make it clickable if needed. Reference had it mostly static/status indicator
                            >
                                <FontAwesomeIcon icon={faPaperPlane} /> {user?.telegramChatId ? 'Connected' : 'Connect'}
                            </button>
                        </div>
                    </div>

                    <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Trigger Condition</label>
                        <div
                            className="form-select cursor-pointer text-start"
                            onClick={(e) => {
                                e.stopPropagation();
                                setTriggerOpen(!triggerOpen);
                            }}
                        >
                            Hotness Score ({hotness})
                        </div>

                        {triggerOpen && (
                            <div
                                className="subscription-dropdown-menu show w-100 p-3" onClick={(e) => e.stopPropagation()}
                            >
                                <div className=" text-center mt-2">
                                    <div>
                                        <span className="range-value">{hotness}</span>
                                    </div>

                                    <div className="range-title">
                                        <h6 className="mb-0 text-sm">Sensitivity TheresHold</h6>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max="10"
                                        value={hotness}
                                        onChange={(e) => setHotness(Number(e.target.value))}
                                        className="hotness-range"
                                        style={{ "--range-progress": `${(hotness / 10) * 100}%` } as React.CSSProperties}
                                    />

                                </div>
                            </div>
                        )}
                    </div>


                    <div className="custom-frm-bx position-relative">
                        <label className="nw-label">Wallet Amount</label>
                        <div
                            className="form-select cursor-pointer text-start"
                            onClick={(e) => {
                                e.stopPropagation();
                                setAmountOpen(!amountOpen);
                            }}
                        >
                            {amount}
                        </div>

                        {amountOpen && (
                            <div
                                className="subscription-dropdown-menu show w-100 p-2"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div
                                    className="subs-items"
                                    onClick={() => {
                                        setAmount("$1K");
                                        setAmountOpen(false);
                                    }}
                                >
                                    $1K
                                </div>
                                <div
                                    className="subs-items"
                                    onClick={() => {
                                        setAmount("$5K");
                                        setAmountOpen(false);
                                    }}
                                >
                                    $5K
                                </div>

                                <input
                                    type="text"
                                    className="form-control mt-2"
                                    placeholder="Custom amount"
                                    value={customAmount}
                                    onChange={(e) => {
                                        setCustomAmount(e.target.value);
                                        setAmount(e.target.value);
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <button
                        className="connect-wallet-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onActivate();
                        }}
                    >
                        {user?.telegramChatId ? 'Active' : 'Connect'}
                    </button>

                </div>
            )}

            {isSaved && (
                <div className="config-overlay">
                    <div className="config-modal">
                        <h3 className="config-title">CONFIGURATION SAVED</h3>

                        <div className="config-box">
                            <div className="config-row">
                                <span>Feed Type</span>
                                <span>Kol Feed</span>
                            </div>

                            <div className="config-row">
                                <span>Min Score</span>
                                <span className="green">{hotness}</span>
                            </div>

                            <div className="config-row">
                                <span>Min Volume</span>
                                <span>{amount}</span>
                            </div>

                            <div className="config-row">
                                <span>Status</span>
                                <span className="green-dot">
                                    Active <i></i>
                                </span>
                            </div>
                        </div>

                        <button
                            className="close-btn"
                            onClick={() => setIsSaved(false)}
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KOLAlertPopup;
