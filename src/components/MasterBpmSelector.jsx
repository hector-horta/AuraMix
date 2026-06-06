import React from 'react'
import { Sliders } from 'lucide-react'
import './MasterBpmSelector.css'

export default function MasterBpmSelector({ masterBpm, onChangeMasterBpm }) {
  return (
    <div className="panel master-bpm-panel">
      <div className="bpm-info-group">
        <Sliders style={{ color: 'var(--neon-pink)' }} size={20} />
        <div>
          <span className="bpm-label-title">BPM MASTER DE MEZCLA</span>
          <p className="bpm-sublabel-title">Ambos decks se sincronizan a este tempo</p>
        </div>
      </div>
      
      <div className="bpm-input-group">
        <input 
          type="range" 
          min="75" 
          max="150" 
          value={masterBpm} 
          onChange={(e) => onChangeMasterBpm(parseInt(e.target.value))}
          className="bpm-range-slider"
        />
        
        <div className="bpm-input-wrapper">
          <input 
            type="number" 
            min="75" 
            max="150" 
            value={masterBpm}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                onChangeMasterBpm(Math.max(75, Math.min(150, val)));
              }
            }}
            className="bpm-number-input"
          />
          <span className="bpm-unit-text">BPM</span>
        </div>
      </div>
    </div>
  )
}
