import React, { useState, useEffect } from 'react';

interface MarketCapRangeSliderProps {
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
}

const MarketCapRangeSlider: React.FC<MarketCapRangeSliderProps> = ({
  minValue,
  maxValue,
  onChange,
}) => {
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeSlider, setActiveSlider] = useState<'min' | 'max' | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const touchOverlayRef = React.useRef<HTMLDivElement>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const touchActiveRef = React.useRef<'min' | 'max' | null>(null);

  React.useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setIsTouchDevice(mq.matches);
    const listener = () => setIsTouchDevice(mq.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  // Constants
  const MIN_RANGE = 1000; // 1K
  const MAX_RANGE = 50000000; // 50M

  // Format number to display format (e.g., $1.0K, $10.5M, $50.0M+)
  const formatValue = (value: number): string => {
    if (value >= 50000000) return '$50.0M+';
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions.toFixed(1)}M`;
    }
    if (value >= 1000) {
      const thousands = value / 1000;
      return `$${thousands.toFixed(1)}K`;
    }
    return `$${value}`;
  };

  // Parse input string to number
  const parseInput = (input: string): number | null => {
    const cleaned = input.replace(/[$,\s]/g, '').toUpperCase();
    if (!cleaned) return null;

    let value = parseFloat(cleaned);
    if (isNaN(value)) return null;

    if (cleaned.endsWith('M+')) {
      return 50000000;
    } else if (cleaned.endsWith('M')) {
      value *= 1000000;
    } else if (cleaned.endsWith('K')) {
      value *= 1000;
    }

    return Math.max(MIN_RANGE, Math.min(MAX_RANGE, value));
  };

  // Convert value to slider position (0-100) using logarithmic scale
  const valueToSlider = (value: number): number => {
    if (value >= MAX_RANGE) return 100;
    if (value <= MIN_RANGE) return 0;
    
    const minLog = Math.log10(MIN_RANGE);
    const maxLog = Math.log10(MAX_RANGE);
    const logValue = Math.log10(value);
    return ((logValue - minLog) / (maxLog - minLog)) * 100;
  };

  // Convert slider position (0-100) to value using logarithmic scale
  const sliderToValue = (position: number): number => {
    if (position >= 100) return MAX_RANGE;
    if (position <= 0) return MIN_RANGE;
    
    const minLog = Math.log10(MIN_RANGE);
    const maxLog = Math.log10(MAX_RANGE);
    const logValue = minLog + (position / 100) * (maxLog - minLog);
    return Math.pow(10, logValue);
  };

  // Update input fields when values change
  useEffect(() => {
    setMinInput(formatValue(minValue));
    setMaxInput(formatValue(maxValue));
  }, [minValue, maxValue]);

  // Calculate percentages for positioning
  const minPercent = valueToSlider(minValue);
  const maxPercent = valueToSlider(maxValue);

  // Determine which slider should be active based on mouse position
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return; // Don't switch while dragging
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mousePercent = (mouseX / rect.width) * 100;
    
    // Calculate distance to each thumb
    const distToMin = Math.abs(mousePercent - minPercent);
    const distToMax = Math.abs(mousePercent - maxPercent);
    
    // Set active slider based on which thumb is closer
    if (distToMin < distToMax) {
      setActiveSlider('min');
    } else {
      setActiveSlider('max');
    }
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setActiveSlider(null);
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setActiveSlider(null);
  };

  const handleTouchStartOverlay = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const positionPercent = (x / rect.width) * 100;
    const distToMin = Math.abs(positionPercent - minPercent);
    const distToMax = Math.abs(positionPercent - maxPercent);
    const which: 'min' | 'max' = distToMin < distToMax ? 'min' : 'max';
    touchActiveRef.current = which;
    setActiveSlider(which);
  };

  const handleTouchMoveOverlay = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch || touchActiveRef.current === null) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, touch.clientX - rect.left));
    const positionPercent = (x / rect.width) * 100;
    const value = sliderToValue(positionPercent);
    if (touchActiveRef.current === 'min') {
      if (value <= maxValue) onChange(value, maxValue);
    } else {
      if (value >= minValue) onChange(minValue, value);
    }
  };

  const handleTouchEndOverlay = () => {
    touchActiveRef.current = null;
    setActiveSlider(null);
  };

  // Add global mouse up listener
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setActiveSlider(null);
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Handle min slider change
  const handleMinSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = Number(e.target.value);
    const newMin = sliderToValue(position);
    if (newMin <= maxValue) {
      onChange(newMin, maxValue);
    }
  };

  // Handle max slider change
  const handleMaxSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = Number(e.target.value);
    const newMax = sliderToValue(position);
    if (newMax >= minValue) {
      onChange(minValue, newMax);
    }
  };

  // Handle min input change
  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMinInput(e.target.value);
  };

  // Handle min input blur
  const handleMinInputBlur = () => {
    const parsed = parseInput(minInput);
    if (parsed !== null && parsed <= maxValue) {
      onChange(parsed, maxValue);
    } else {
      setMinInput(formatValue(minValue));
    }
  };

  // Handle max input change
  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMaxInput(e.target.value);
  };

  // Handle max input blur
  const handleMaxInputBlur = () => {
    const parsed = parseInput(maxInput);
    if (parsed !== null && parsed >= minValue) {
      onChange(minValue, parsed);
    } else {
      setMaxInput(formatValue(maxValue));
    }
  };

  return (
    <div style={{ padding: '8px 12px' }}>
      {/* Slider Container */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          height: isTouchDevice ? '44px' : '20px',
          marginBottom: '12px',
          marginTop: isTouchDevice ? '-12px' : 0,
        }}
      >
        {/* Track Background */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '4px',
            top: '8px',
            borderRadius: '2px',
            background: '#2a2a2a',
            pointerEvents: 'none',
          }}
        />

        {/* Active Range Highlight */}
        <div
          style={{
            position: 'absolute',
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
            height: '4px',
            top: '8px',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #162ECD 0%, #4A5FFF 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Min Thumb Slider */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={minPercent}
          onChange={handleMinSliderChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          style={{
            position: 'absolute',
            width: '100%',
            height: '20px',
            top: '0',
            left: '0',
            background: 'transparent',
            appearance: 'none',
            WebkitAppearance: 'none',
            zIndex: activeSlider === 'min' ? 10 : 4,
            margin: 0,
            padding: 0,
            pointerEvents: activeSlider === 'min' || activeSlider === null ? 'all' : 'none',
            cursor: 'pointer',
          }}
          className="dual-thumb-slider"
        />

        {/* Max Thumb Slider */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={maxPercent}
          onChange={handleMaxSliderChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          style={{
            position: 'absolute',
            width: '100%',
            height: '20px',
            top: '0',
            left: '0',
            background: 'transparent',
            appearance: 'none',
            WebkitAppearance: 'none',
            zIndex: activeSlider === 'max' ? 10 : 3,
            margin: 0,
            padding: 0,
            pointerEvents: activeSlider === 'max' || activeSlider === null ? 'all' : 'none',
            cursor: 'pointer',
          }}
          className="dual-thumb-slider"
        />

        {/* Touch overlay: on mobile, handles touch so user can drag either thumb (no hover to choose on touch) */}
        {isTouchDevice && (
          <div
            ref={touchOverlayRef}
            role="presentation"
            onTouchStart={handleTouchStartOverlay}
            onTouchMove={handleTouchMoveOverlay}
            onTouchEnd={handleTouchEndOverlay}
            onTouchCancel={handleTouchEndOverlay}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '44px',
              zIndex: 15,
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
          />
        )}
      </div>

      {/* Input Fields */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Minimum Input */}
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontSize: '9px',
              color: '#8f8f8f',
              marginBottom: '3px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            Min
          </label>
          <input
            type="text"
            value={minInput}
            onChange={handleMinInputChange}
            onBlur={handleMinInputBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleMinInputBlur();
                e.currentTarget.blur();
              }
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '11px',
              color: '#fff',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '2px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#162ECD';
            }}
            onBlurCapture={(e) => {
              e.target.style.borderColor = '#2a2a2a';
            }}
          />
        </div>

        {/* Maximum Input */}
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontSize: '9px',
              color: '#8f8f8f',
              marginBottom: '3px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            Max
          </label>
          <input
            type="text"
            value={maxInput}
            onChange={handleMaxInputChange}
            onBlur={handleMaxInputBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleMaxInputBlur();
                e.currentTarget.blur();
              }
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '11px',
              color: '#fff',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '2px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#162ECD';
            }}
            onBlurCapture={(e) => {
              e.target.style.borderColor = '#2a2a2a';
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default MarketCapRangeSlider;
