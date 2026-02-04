import React from 'react';

interface TransactionListSkeletonProps {
    variant?: 'alpha' | 'kol';
    count?: number;
}

const AlphaSkeletonItem = () => (
    <div className="mb-3 nw-custm-trade-bx" style={{ border: '1px solid #141414' }}>
        {/* Header Section */}
        <div className="d-flex align-items-center justify-content-between nw-btm-brd" style={{ borderBottom: '1px solid #141414', padding: '8px', backgroundColor: '#0a0a0a', minHeight: '40px' }}>
            <div style={{ width: '60px', height: '12px' }} className="bg-[#1a1a1a] animate-pulse"></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '100px', height: '14px' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '70px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '24px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '24px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
            </div>
        </div>

        {/* Main Card Section */}
        <div className="custom-card" style={{ background: '#0a0a0a', color: '#fff', gap: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', minHeight: '80px' }}>
            {/* Left: Avatar */}
            <div className="left-item-bx" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                <div style={{ width: '64px', height: '64px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                {/* Skeleton lines removed as per request */}

            </div>

            {/* Center: BUY/SELL */}
            <div className="sell-trade-bx" style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, justifyContent: 'center' }}>
                <div style={{ width: '72px', height: '24px' }} className="bg-[#1a1a1a] animate-pulse"></div>
            </div>

            {/* Right: Token Image */}
            <div className="right-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                {/* Right side skeleton lines removed */}

                <div className="right-img" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                </div>
            </div>
        </div>
    </div>
);

const KOLSkeletonItem = () => (
    <div className="mb-3 nw-custm-trade-bx" style={{ border: '1px solid #141414' }}>
        {/* Header Section */}
        <div className="d-flex align-items-center justify-content-between nw-btm-brd" style={{ borderBottom: '1px solid #141414', padding: '8px', backgroundColor: '#0a0a0a', minHeight: '40px' }}>
            <div style={{ width: '60px', height: '12px' }} className="bg-[#1a1a1a] animate-pulse"></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '100px', height: '14px' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '70px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '24px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                <div style={{ width: '24px', height: '24px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
            </div>
        </div>

        {/* Main Card Section */}
        <div className="custom-card" style={{ background: '#0a0a0a', color: '#fff', gap: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', minHeight: '80px' }}>
            {/* Left: Avatar */}
            <div className="left-item-bx" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                <div style={{ width: '64px', height: '64px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                {/* Skeleton lines removed as per request */}

            </div>

            {/* Center: BUY/SELL */}
            <div className="sell-trade-bx" style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, justifyContent: 'center' }}>
                <div style={{ width: '72px', height: '24px' }} className="bg-[#1a1a1a] animate-pulse"></div>
            </div>

            {/* Right: Token Image */}
            <div className="right-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                {/* Right side skeleton lines removed */}

                <div className="right-img" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', border: '1px solid #3d3d3d' }} className="bg-[#1a1a1a] animate-pulse"></div>
                </div>
            </div>
        </div>
    </div>
);

const TransactionListSkeleton: React.FC<TransactionListSkeletonProps> = ({ variant = 'alpha', count = 5 }) => {
    return (
        <div className="skeleton-container">
            {Array.from({ length: count }).map((_, i) => (
                variant === 'alpha' ? <AlphaSkeletonItem key={i} /> : <KOLSkeletonItem key={i} />
            ))}
        </div>
    );
};

export default TransactionListSkeleton;

