import React from 'react'
import { Repeat, Music, Disc } from 'lucide-react'
import './LooperPad.css'

export default function LooperPad({ deckA, deckB, onToggleLoop }) {
  const loopOptions = [
    { bars: 4, beats: 16 },
    { bars: 8, beats: 32 },
    { bars: 12, beats: 48 },
    { bars: 16, beats: 64 }
  ];

  const renderDeckLooper = (deckId, deck, accentColor) => {
    const isLoaded = !!deck.track;
    
    return (
      <div className={`looper-deck-channel looper-deck-${deckId.toLowerCase()}`}>
        <div className="looper-deck-header" style={{ borderColor: `var(--neon-${accentColor})` }}>
          <div className="looper-deck-icon-wrapper">
            <Disc className={`looper-deck-disc ${deck.isPlaying ? 'spinning' : ''}`} style={{ color: `var(--neon-${accentColor})` }} size={20} />
          </div>
          <div className="looper-deck-info">
            <h4 className="looper-deck-title" style={{ color: `var(--neon-${accentColor})` }}>Deck {deckId}</h4>
          </div>
        </div>

        <div className="looper-pads-grid">
          {loopOptions.map((opt) => {
            const isActive = deck.activeLoopBars === opt.bars;
            return (
              <button
                key={opt.bars}
                disabled={!isLoaded}
                onClick={() => onToggleLoop(deckId, opt.bars)}
                className={`looper-pad-btn ${isActive ? 'active' : ''} ${!isLoaded ? 'disabled' : ''}`}
                style={{
                  '--accent-color': `var(--neon-${accentColor})`,
                  '--glow-color': isActive ? `var(--glow-${accentColor})` : 'none',
                  borderColor: isActive ? `var(--neon-${accentColor})` : 'var(--border-color)'
                }}
              >
                <div className="looper-pad-icon-row">
                  <Repeat size={14} className={isActive ? 'pulse-icon' : ''} />
                  <span className="looper-pad-beats">{opt.beats} BEATS</span>
                </div>
                <div className="looper-pad-bars">{opt.bars} BARRAS</div>
                {isActive && <div className="looper-pad-indicator-dot" style={{ backgroundColor: `var(--neon-${accentColor})` }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="looper-container">
      {/* Visual Header / Info bar */}
      <div className="looper-info-bar">
        <div className="looper-identity">
          <Repeat size={16} className="looper-header-icon" />
          <div>
            <h3 className="looper-header-title">AuraLoops</h3>
            <p className="looper-header-desc">Loops cuantizados al tempo de la pista para intros, outros y mezclas extendidas.</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Split Deck Layout */}
      <div className="looper-layout">
        {renderDeckLooper('A', deckA, 'cyan')}
        {renderDeckLooper('B', deckB, 'pink')}
      </div>
    </div>
  );
}
