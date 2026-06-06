import React from 'react'
import { Sliders } from 'lucide-react'
import EqKnob from './EqKnob'
import './MixerPanel.css'

export default function MixerPanel({
  deckA,
  deckB,
  crossfader,
  transitionActive,
  onEqChange,
  onVolumeChange,
  onCrossfaderChange
}) {
  return (
    <div className="panel mixer-panel" style={{ marginTop: '1.5rem' }}>
      <div className="mixer-header">
        <h2 className="mixer-title">Panel de Control de Mezclas</h2>
        <Sliders size={16} style={{ color: 'var(--text-muted)' }} />
      </div>

      {/* EQ Section */}
      <div className="eq-section">
        {/* Deck A EQs */}
        <div className="eq-column eq-deck-a">
          <span className="eq-deck-title eq-deck-a">Deck A EQs</span>
          
          <EqKnob 
            label="High" 
            value={deckA.eq.high} 
            onChange={(val) => onEqChange('A', 'high', val)} 
          />
          <EqKnob 
            label="Mid" 
            value={deckA.eq.mid} 
            onChange={(val) => onEqChange('A', 'mid', val)} 
          />
          <EqKnob 
            label="Low" 
            value={deckA.eq.low} 
            onChange={(val) => onEqChange('A', 'low', val)} 
          />
        </div>

        {/* Deck B EQs */}
        <div className="eq-column eq-deck-b">
          <span className="eq-deck-title eq-deck-b">Deck B EQs</span>
          
          <EqKnob 
            label="High" 
            value={deckB.eq.high} 
            onChange={(val) => onEqChange('B', 'high', val)} 
          />
          <EqKnob 
            label="Mid" 
            value={deckB.eq.mid} 
            onChange={(val) => onEqChange('B', 'mid', val)} 
          />
          <EqKnob 
            label="Low" 
            value={deckB.eq.low} 
            onChange={(val) => onEqChange('B', 'low', val)} 
          />
        </div>
      </div>

      {/* Volume sliders & Crossfader */}
      <div className="mixer-faders-crossfader-row">
        <div className="faders-section eq-section" style={{ height: '110px' }}>
          <div className="vol-fader-container eq-deck-a">
            <span className="eq-knob-label">Vol A</span>
            <div className="vol-slider-wrapper">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={deckA.volume} 
                onChange={(e) => onVolumeChange('A', e.target.value)}
                className="vol-slider"
              />
            </div>
          </div>
          
          <div className="vol-fader-container eq-deck-b">
            <span className="eq-knob-label">Vol B</span>
            <div className="vol-slider-wrapper">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={deckB.volume} 
                onChange={(e) => onVolumeChange('B', e.target.value)}
                className="vol-slider"
              />
            </div>
          </div>
        </div>

        {/* Crossfader */}
        <div className="crossfader-section">
          <div className="crossfader-label-row">
            <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>Deck A</span>
            <span>Crossfader</span>
            <span style={{ color: 'var(--neon-pink)', fontWeight: 700 }}>Deck B</span>
          </div>
          <input 
            type="range" 
            min="-1" 
            max="1" 
            step="0.02" 
            value={crossfader} 
            onChange={(e) => onCrossfaderChange(parseFloat(e.target.value))}
            className="crossfader-slider"
            disabled={transitionActive}
          />
        </div>
      </div>
    </div>
  )
}
