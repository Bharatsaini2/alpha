import React, { useRef, useEffect } from 'react';

interface DualRangeSliderProps {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  formatValue: (value: number) => string;
}

const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  minValue,
  maxValue,
  onChange,
  formatValue,
}) => {
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<HTMLDivElement>(null);

  const getPercent = (value: number) => ((value - min) / (max - min)) * 100;

  useEffect(() => {
    if (rangeRef.current) {
      const minPercent = getPercent(minValue);
      const maxPercent = getPercent(maxValue);
      rangeRef.current.style.left = `${minPercent}%`;
      rangeRef.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [minValue, maxValue, min, max]);

  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', color: '#8f8f8f' }}>
        <span>{formatValue(minValue)}</span>
        <span>{formatValue(maxValue)}</span>
      </div>
      
      <div style={{ position: 'relative', height: '6px' }}>
        {/* Track */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          background: '#2a2a2a',
        }} />
        
        {/* Range highlight */}
        <div
          ref={rangeRef}
          style={{
            position: 'absolute',
            height: '6px',
            borderRadius: '3px',
            background: 'linear-gradient(90deg, #162ECD 0%, #4A5FFF 100%)',
          }}
        />
        
        {/* Min thumb */}
        <input
          ref={minRef}
          type="range"
          min={min}
          max={max}
          value={minValue}
          onChange={(e) => {
            const value = Math.min(Number(e.target.value), maxValue);
            onChange(value, maxValue);
          }}
          style={{
            position: 'absolute',
            width: '100%',
            height: '6px',
            background: 'transparent',
            pointerEvents: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            zIndex: minValue > max - 100 ? 5 : 3,
          }}
          className="dual-range-thumb"
        />
        
        {/* Max thumb */}
        <input
          ref={maxRef}
          type="range"
          min={min}
          max={max}
          value={maxValue}
          onChange={(e) => {
            const value = Math.max(Number(e.target.value), minValue);
            onChange(minValue, value);
          }}
          style={{
            position: 'absolute',
            width: '100%',
            height: '6px',
            background: 'transparent',
            pointerEvents: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            zIndex: 4,
          }}
          className="dual-range-thumb"
        />
      </div>
      
      <style>{`
        .dual-range-thumb::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #162ECD;
          border: 2px solid #fff;
          cursor: pointer;
          pointer-events: all;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .dual-range-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #162ECD;
          border: 2px solid #fff;
          cursor: pointer;
          pointer-events: all;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  );
};

export default DualRangeSlider;
