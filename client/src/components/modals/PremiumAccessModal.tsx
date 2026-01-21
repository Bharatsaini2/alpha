import React from 'react';

interface PremiumAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBuyNow: () => void;
}

export const PremiumAccessModal: React.FC<PremiumAccessModalProps> = ({ isOpen, onClose, onBuyNow }) => {
    if (!isOpen) return null;

    return (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered modal-sm">
                <div className="modal-content nw-sign-frm p-4" style={{ backgroundColor: '#111113', border: '1px solid #222', borderRadius: '0px' }}>
                    <div className="modal-body text-center p-0">
                        <h4 style={{ color: '#fff', fontSize: '18px', marginBottom: '20px', lineHeight: '1.5' }}>
                            You Need 1000 $ALPHA To Subscribe to Personalized Alerts
                        </h4>

                        <div className="d-flex gap-3 justify-content-center" style={{ flexDirection: 'row' }}>
                            <button
                                onClick={onBuyNow}
                                className="plan-btn"
                                style={{
                                    backgroundColor: '#fff',
                                    color: '#000',
                                    padding: '10px',
                                    borderRadius: '0px',
                                    fontWeight: '600',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    flex: 1,
                                    textAlign: 'center',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                BUY NOW
                            </button>

                            <button
                                onClick={onClose}
                                className="plan-btn"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#fff',
                                    border: '1px solid #333',
                                    padding: '10px',
                                    borderRadius: '0px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    flex: 1,
                                    textAlign: 'center',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
