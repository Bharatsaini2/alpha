import React from 'react';

interface TransactionListSkeletonProps {
    variant?: 'alpha' | 'kol';
    count?: number;
}

const ShimmerDiv = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <div
        className={className}
        style={{
            ...style,
            background: "#1a1a1a",
            animation: "shimmer 1.2s ease-in-out infinite",
            backgroundSize: "200% 100%",
            backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)",
        }}
    />
);

const AlphaSkeletonItem = () => (
    <div className="mb-3 nw-custm-trade-bx" style={{ border: '1px solid #141414' }}>
        {/* Header Section */}
        <div className="d-flex align-items-center justify-content-between nw-btm-brd" style={{ borderBottom: '1px solid #141414', padding: '8px', backgroundColor: '#0a0a0a', minHeight: '40px' }}>
            <div style={{ width: '60px', height: '12px', backgroundColor: '#1a1a1a' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '100px', height: '14px', backgroundColor: '#1a1a1a' }}></div>
                <div style={{ width: '70px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ width: '24px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ width: '24px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
            </div>
        </div>

        {/* Main Card Section */}
        <div className="custom-card" style={{ background: '#0a0a0a', color: '#fff', gap: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', minHeight: '80px' }}>
            {/* Left: Avatar */}
            <div className="left-item-bx" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ flex: 1 }}></div>
            </div>

            {/* Center: BUY/SELL */}
            <div className="sell-trade-bx" style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, justifyContent: 'center' }}>
                <div style={{ width: '72px', height: '24px', backgroundColor: '#1a1a1a' }}></div>
            </div>

            {/* Right: Token Image */}
            <div className="right-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <div style={{ flex: 1 }}></div>
                <div className="right-img" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                </div>
            </div>
        </div>
    </div>
);

const KOLSkeletonItem = () => (
    <div className="mb-3 nw-custm-trade-bx" style={{ border: '1px solid #141414' }}>
        {/* Header Section */}
        <div className="d-flex align-items-center justify-content-between nw-btm-brd" style={{ borderBottom: '1px solid #141414', padding: '8px', backgroundColor: '#0a0a0a', minHeight: '40px' }}>
            <div style={{ width: '60px', height: '12px', backgroundColor: '#1a1a1a' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '100px', height: '14px', backgroundColor: '#1a1a1a' }}></div>
                <div style={{ width: '70px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ width: '24px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ width: '24px', height: '24px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
            </div>
        </div>

        {/* Main Card Section */}
        <div className="custom-card" style={{ background: '#0a0a0a', color: '#fff', gap: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', minHeight: '80px' }}>
            {/* Left: Avatar */}
            <div className="left-item-bx" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
                <div style={{ flex: 1 }}></div>
            </div>

            {/* Center: BUY/SELL */}
            <div className="sell-trade-bx" style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1, justifyContent: 'center' }}>
                <div style={{ width: '72px', height: '24px', backgroundColor: '#1a1a1a' }}></div>
            </div>

            {/* Right: Token Image */}
            <div className="right-info" style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <div style={{ flex: 1 }}></div>
                <div className="right-img" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <div style={{ width: '64px', height: '64px', backgroundColor: '#1a1a1a', border: '1px solid #3d3d3d' }}></div>
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
