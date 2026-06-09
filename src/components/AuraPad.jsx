import React, { useRef, useState } from 'react'
import { Disc, Activity } from 'lucide-react'
import './AuraPad.css'

const FX_TYPES = [
  { name: 'Filter', color: 'var(--neon-cyan)', bgGlow: 'rgba(0, 240, 255, 0.15)', desc: 'Dual LowPass/HighPass Filter', xParam: 'Frequency', yParam: 'Q/Resonance' },
  { name: 'Delay', color: 'var(--neon-purple)', bgGlow: 'rgba(157, 78, 221, 0.15)', desc: 'Feedback Delay (10ms - 1s)', xParam: 'Time', yParam: 'Feedback' },
  { name: 'Echo', color: 'rgba(0, 255, 170, 1)', bgGlow: 'rgba(0, 255, 170, 0.15)', desc: 'Long Space Echo with Mix', xParam: 'Time', yParam: 'Wet Mix' },
  { name: 'Flanger', color: 'var(--neon-pink)', bgGlow: 'rgba(255, 0, 127, 0.15)', desc: 'Metallic LFO Sweeper', xParam: 'LFO Rate', yParam: 'Depth' },
  { name: 'Beat Repeat', color: 'rgba(255, 100, 0, 1)', bgGlow: 'rgba(255, 100, 0, 0.15)', desc: 'Audio Freeze & Stutter Loop', xParam: 'Division (1/4 - 1/64)', yParam: 'Mix' },
  { name: 'Tape Stop', color: 'rgba(255, 215, 0, 1)', bgGlow: 'rgba(255, 215, 0, 0.15)', desc: 'Vinyl Slowdown Effect', xParam: 'Stop Duration', yParam: 'Unused' }
];

export default function AuraPad({ fxState, onUpdateFx }) {
  const padRef = useRef(null);
  const [selectedFx, setSelectedFx] = useState('Filter');
  const [isPressing, setIsPressing] = useState(false);
  const [coords, setCoords] = useState({ x: 0.5, y: 0.5 });

  const activeFxInfo = FX_TYPES.find(f => f.name === selectedFx) || FX_TYPES[0];

  const handlePointerDown = (e) => {
    setIsPressing(true);
    e.target.setPointerCapture(e.pointerId);
    updateCoords(e, true);
  };

  const handlePointerMove = (e) => {
    if (!isPressing) return;
    updateCoords(e, false);
  };

  const handlePointerUp = (e) => {
    setIsPressing(false);
    e.target.releasePointerCapture(e.pointerId);
    onUpdateFx(false, selectedFx, coords.x, coords.y);
  };

  const updateCoords = (e, isInitialTouch) => {
    const pad = padRef.current;
    if (!pad) return;

    const rect = pad.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = 1.0 - (e.clientY - rect.top) / rect.height;
    
    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));

    setCoords({ x, y });
    onUpdateFx(true, selectedFx, x, y, isInitialTouch);
  };

  const handleFxSelect = (name) => {
    setSelectedFx(name);
    if (isPressing) {
      onUpdateFx(true, name, coords.x, coords.y, true);
    } else {
      onUpdateFx(false, name, coords.x, coords.y);
    }
  };

  const getDisplayValueX = () => {
    if (!isPressing && !fxState.active) return '---';
    const x = coords.x;
    switch (selectedFx) {
      case 'Filter':
        if (x < 0.45) return `LowPass (${Math.round(20 + (x / 0.45) * 19980)} Hz)`;
        if (x > 0.55) return `HighPass (${Math.round(20 + ((x - 0.55) / 0.45) * 19980)} Hz)`;
        return 'Bypass (Flat)';
      case 'Delay':
        return `${Math.round((0.01 + x * 0.99) * 1000)} ms`;
      case 'Echo':
        return `${(0.2 + x * 1.8).toFixed(2)} s`;
      case 'Flanger':
        return `${(0.1 + x * 4.9).toFixed(1)} Hz`;
      case 'Beat Repeat':
        if (x < 0.2) return '1/4 Beat';
        if (x < 0.4) return '1/8 Beat';
        if (x < 0.6) return '1/16 Beat';
        if (x < 0.8) return '1/32 Beat';
        return '1/64 Beat';
      case 'Tape Stop':
        return `${(0.1 + x * 2.0).toFixed(1)} s`;
      default:
        return `${Math.round(x * 100)}%`;
    }
  };

  const getDisplayValueY = () => {
    if (!isPressing && !fxState.active) return '---';
    const y = coords.y;
    switch (selectedFx) {
      case 'Filter':
        return `Q: ${(y * 15).toFixed(1)}`;
      case 'Delay':
        return `Feedback: ${Math.round(y * 90)}%`;
      case 'Echo':
        return `Wet Mix: ${Math.round(y * 100)}%`;
      case 'Flanger':
        return `Depth: ${Math.round(y * 10)} ms`;
      case 'Beat Repeat':
        return `Mix: ${Math.round(y * 100)}%`;
      case 'Tape Stop':
        return '---';
      default:
        return `${Math.round(y * 100)}%`;
    }
  };

  return (
    <div className="aurapad-container">
      {/* Visual Header / Info bar */}
      <div className="aurapad-info-bar" style={{ borderColor: activeFxInfo.color }}>
        <div className="aurapad-fx-identity">
          <Activity size={16} style={{ color: activeFxInfo.color }} />
          <div>
            <h3 className="aurapad-fx-name" style={{ color: activeFxInfo.color }}>{selectedFx}</h3>
            <p className="aurapad-fx-desc">{activeFxInfo.desc}</p>
          </div>
        </div>
        <div className="aurapad-coords-display">
          <div className="coord-val">
            <span className="coord-label">{activeFxInfo.xParam}: </span>
            <span className="coord-num">{getDisplayValueX()}</span>
          </div>
          <div className="coord-val">
            <span className="coord-label">{activeFxInfo.yParam}: </span>
            <span className="coord-num">{getDisplayValueY()}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Selector + TouchPad */}
      <div className="aurapad-layout">
        {/* Buttons List */}
        <div className="aurapad-selector">
          {FX_TYPES.map((fx) => (
            <button
              key={fx.name}
              className={`aurapad-selector-btn ${selectedFx === fx.name ? 'active' : ''}`}
              style={{
                '--hover-glow': fx.color,
                borderColor: selectedFx === fx.name ? fx.color : 'rgba(255, 255, 255, 0.05)',
                color: selectedFx === fx.name ? '#fff' : 'var(--text-muted)'
              }}
              onClick={() => handleFxSelect(fx.name)}
            >
              <span 
                className="aurapad-btn-bullet" 
                style={{ backgroundColor: selectedFx === fx.name ? fx.color : 'rgba(255, 255, 255, 0.2)' }}
              />
              <span>{fx.name}</span>
            </button>
          ))}
        </div>

        {/* TouchPad Surface */}
        <div 
          ref={padRef}
          className={`aurapad-pad ${isPressing ? 'pressing' : ''}`}
          style={{ 
            '--glow-color': activeFxInfo.color,
            background: isPressing ? `radial-gradient(circle at ${coords.x * 100}% ${(1 - coords.y) * 100}%, ${activeFxInfo.bgGlow} 0%, rgba(0, 0, 0, 0.45) 70%)` : 'rgba(0, 0, 0, 0.4)'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Background Grid Lines */}
          <div className="pad-grid-x"></div>
          <div className="pad-grid-y"></div>

          {selectedFx === 'Filter' && (
            <div className="pad-center-guide" title="Center Neutral Zone"></div>
          )}

          {/* Draggable indicator handle */}
          <div 
            className="pad-handle"
            style={{
              left: `${coords.x * 100}%`,
              top: `${(1 - coords.y) * 100}%`,
              borderColor: activeFxInfo.color,
              boxShadow: `0 0 15px ${activeFxInfo.color}, inset 0 0 5px ${activeFxInfo.color}`
            }}
          >
            <span className="handle-dot" style={{ backgroundColor: activeFxInfo.color }} />
            {isPressing && (
              <>
                <div className="handle-guideline-x" style={{ borderTopColor: activeFxInfo.color }}></div>
                <div className="handle-guideline-y" style={{ borderLeftColor: activeFxInfo.color }}></div>
              </>
            )}
          </div>

          {!isPressing && (
            <div className="pad-watermark">
              <Disc size={36} className="pad-watermark-icon" />
              <span>TOCA O ARRASTRA PARA MODULAR</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
