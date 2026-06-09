import React, { useState } from 'react'
import { Sliders, RefreshCw, Radio } from 'lucide-react'
import EqKnob from './EqKnob'
import AuraPad from './AuraPad'
import './MixerPanel.css'

export default function MixerPanel({
  deckA,
  deckB,
  transitionActive,
  onEqChange,
  onVolumeChange,
  onResync,
  fxState,
  onUpdateFx
}) {
  const [activeTab, setActiveTab] = useState('mixer'); // 'mixer' or 'fx'

  return (
    <div className="panel mixer-panel" style={{ marginTop: '1rem' }}>
      {/* Tab Headers */}
      <div className="mixer-header-tabs">
        <button 
          className={`mixer-tab-btn ${activeTab === 'mixer' ? 'active' : ''}`}
          onClick={() => setActiveTab('mixer')}
        >
          <Sliders size={14} />
          <span>Mixer</span>
        </button>
        <button 
          className={`mixer-tab-btn ${activeTab === 'fx' ? 'active' : ''}`}
          onClick={() => setActiveTab('fx')}
        >
          <Radio size={14} />
          <span>AuraPad</span>
        </button>
      </div>

      {activeTab === 'mixer' ? (
        /* Main Mixer Control Layout: Vol A | Deck A EQs | Deck B EQs | Vol B */
        <div className="mixer-controls-layout">
          {/* Vol A */}
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

          {/* Central Sync Control */}
          <div className="mixer-sync-column">
            <button 
              onClick={onResync} 
              className="sync-btn"
              disabled={!(deckA.isPlaying && deckB.isPlaying)}
              title={!(deckA.isPlaying && deckB.isPlaying) ? "Ambos decks deben estar sonando para resincronizar" : "Sincronizar fase y compás de ambos decks"}
            >
              <RefreshCw className="sync-icon" size={16} />
              <span>SYNC</span>
            </button>
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

          {/* Vol B */}
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
      ) : (
        <AuraPad fxState={fxState} onUpdateFx={onUpdateFx} />
      )}
    </div>
  )
}
