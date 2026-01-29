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
            animation: "shimmer 6s infinite linear",
            backgroundSize: "200% 100%",
            backgroundImage: "linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 50%, #1a1a1a 100%)",
        }}
    />
);

const AlphaSkeletonItem = () => (
    <div className="bg-[#111113] border border-[#2A2A2D] rounded-lg p-4 mb-3">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
                <ShimmerDiv className="h-3 w-16 rounded" />
                <ShimmerDiv className="h-3 w-24 rounded" />
            </div>
            <div className="flex items-center gap-2">
                <ShimmerDiv className="h-6 w-20 rounded" />
                <ShimmerDiv className="h-6 w-6 rounded" />
                <ShimmerDiv className="h-6 w-6 rounded" />
            </div>
        </div>

        {/* Body */}
        <div className="flex items-center justify-between">
            {/* Left Column */}
            <div className="flex items-center gap-4 flex-1">
                <ShimmerDiv className="w-14 h-14 rounded-full flex-shrink-0" />
                <div className="flex flex-col gap-2">
                    <ShimmerDiv className="h-4 w-20 rounded" />
                    <div className="flex gap-1">
                        <ShimmerDiv className="h-3 w-12 rounded" />
                        <ShimmerDiv className="h-3 w-12 rounded" />
                    </div>
                    <ShimmerDiv className="h-4 w-24 rounded" />
                    <ShimmerDiv className="h-4 w-32 rounded" />
                </div>
            </div>

            {/* Right Column */}
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end gap-2">
                    <ShimmerDiv className="h-4 w-16 rounded" />
                    <ShimmerDiv className="h-3 w-24 rounded" />
                    <ShimmerDiv className="h-3 w-32 rounded" />
                </div>
                <ShimmerDiv className="w-14 h-14 rounded-full flex-shrink-0" />
            </div>
        </div>
    </div>
);

const KOLSkeletonItem = () => (
    <div className="custom-card relative overflow-hidden flex items-center justify-between p-4 mb-3" style={{ minHeight: '100px', background: '#111113', border: '1px solid #2A2A2D', borderRadius: '12px' }}>
        <div className="left-item-bx" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <ShimmerDiv style={{ width: '60px', height: '60px', borderRadius: '0', flexShrink: 0 }} />
            <div className="whale-content flex-grow-1" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ShimmerDiv style={{ height: '16px', width: '120px', borderRadius: '4px' }} />
                <ShimmerDiv style={{ height: '12px', width: '90px', borderRadius: '4px' }} />
                <div style={{ display: 'flex', gap: '5px' }}>
                    <ShimmerDiv style={{ height: '14px', width: '50px', borderRadius: '4px' }} />
                    <ShimmerDiv style={{ height: '14px', width: '50px', borderRadius: '4px' }} />
                </div>
                <ShimmerDiv style={{ height: '16px', width: '100px', borderRadius: '4px' }} />
            </div>
        </div>

        <div className="sell-trade-bx hidden md:block" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <ShimmerDiv style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
        </div>

        <div className="right-info text-end" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="left-crd-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <ShimmerDiv style={{ height: '16px', width: '60px', borderRadius: '4px' }} />
                <ShimmerDiv style={{ height: '12px', width: '100px', borderRadius: '4px' }} />
                <ShimmerDiv style={{ height: '10px', width: '140px', borderRadius: '4px' }} />
            </div>
            <div className="right-img">
                <ShimmerDiv style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
            </div>
        </div>
    </div>
);

const TransactionListSkeleton: React.FC<TransactionListSkeletonProps> = ({ variant = 'alpha', count = 5 }) => {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                variant === 'alpha' ? <AlphaSkeletonItem key={i} /> : <KOLSkeletonItem key={i} />
            ))}
        </>
    );
};

export default TransactionListSkeleton;
