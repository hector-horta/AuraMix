import React from 'react'

export default function EqKnob({ label, value, onChange }) {
  const handleClick = () => {
    // Simple cycle click for a web knob without drag complexity:
    // 0 -> 6 -> -12 -> -40 -> 0
    const nextVal = value === 0 ? 6 : value === 6 ? -12 : value === -12 ? -40 : 0;
    onChange(nextVal);
  };

  const rotation = value === 0 ? 0 : value > 0 ? (value / 6) * 75 : (value / 40) * 135;

  return (
    <div className="eq-knob-container">
      <span className="eq-knob-label">{label}</span>
      <div className="knob-wrapper" onClick={handleClick}>
        <div className="knob-body">
          <div 
            className={`knob-marker ${value !== 0 ? 'knob-marker-active' : ''}`} 
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      </div>
      <span className="eq-value-tooltip">{value > 0 ? '+' : ''}{value}dB</span>
    </div>
  )
}
