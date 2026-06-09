import React from 'react'
import { Play, Pause, SkipForward, Disc } from 'lucide-react'
import Waveform from './Waveform'
import { formatTime } from '../utils/formatTime'
import { GENRE_COLORS, GENRE_EMOJIS } from '../utils/audioAnalyzer'
import './Deck.css'

export default function Deck({
  deckId,
  deck,
  waveformData,
  isActive,
  onTogglePlay,
  onSeek,
  onJumpToOutro,
  onPitchChange,
  onToggleVinyl,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  accentColor,
  djMode
}) {
  const isCyan = accentColor === 'cyan';
  const playedColor = isCyan ? '#00f0ff' : '#ff007f';
  const unplayedColor = isCyan ? '#17496e' : '#6d1844';

  let customStyle = {};
  if (deck.isPlaying && deck.track) {
    const bpm = deck.track.bpm;
    const firstBeatOffset = deck.track.firstBeatOffset || 0.0;
    const beatDuration = 60 / bpm;
    const elapsed = Math.max(0, deck.currentTime - firstBeatOffset);
    const progress = (elapsed % beatDuration) / beatDuration;
    
    // Cubic decay for punchy visual flash on beat
    const intensity = Math.pow(1 - progress, 3);
    
    const r = isCyan ? 0 : 255;
    const g = isCyan ? 240 : 0;
    const b = isCyan ? 255 : 127;
    
    const baseBorderOpacity = isActive ? 0.35 : 0.08;
    const targetBorderOpacity = baseBorderOpacity + intensity * (1 - baseBorderOpacity);
    
    const baseShadowOpacity = isActive ? 0.15 : 0.02;
    const targetShadowOpacity = baseShadowOpacity + intensity * 0.25;
    
    customStyle = {
      borderColor: `rgba(${r}, ${g}, ${b}, ${targetBorderOpacity})`,
      boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, ${targetShadowOpacity}), var(--shadow-lg)`,
      transition: 'none' // Disable smooth transition for instantaneous beat response
    };
  }

  return (
    <section 
      className={`panel deck deck-${deckId.toLowerCase()} ${isActive ? `panel-active-${accentColor}` : ''}`}
      style={customStyle}
    >
      <div className="deck-header">
        <span className="deck-label">Deck {deckId}</span>
        <div className="deck-header-right">
          <div className="vinyl-toggle-container">
            <span className="vinyl-toggle-label">VINYL</span>
            <button 
              onClick={onToggleVinyl}
              className={`vinyl-toggle-btn ${deck.vinylMode ? 'active' : ''}`}
              title="Vinyl Mode: ON para scratch y tape-stop, OFF para pitch bending tradicional"
            >
              {deck.vinylMode ? 'ON' : 'OFF'}
            </button>
          </div>
          {deck.track && (
            <span className="deck-key-display">{deck.track.key}</span>
          )}
        </div>
      </div>

      {deck.track ? (
        <>
          <div key={deck.track.id} className="deck-loaded-content">
            <div className="track-info">
              <h3 className="track-title">{deck.track.title}</h3>
              <p className="track-artist">{deck.track.artist}</p>
              {djMode === 'jukebox' && deck.track.genre && (
                <span 
                  className="deck-genre-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    border: `1px solid ${GENRE_COLORS[deck.track.genre] || '#fff'}`,
                    color: GENRE_COLORS[deck.track.genre] || '#fff',
                    background: 'rgba(0,0,0,0.3)',
                    marginTop: '0.3rem',
                    boxShadow: `0 0 8px ${GENRE_COLORS[deck.track.genre]}44`,
                    width: 'fit-content'
                  }}
                >
                  {GENRE_EMOJIS[deck.track.genre] || '🎵'} {deck.track.genre}
                </span>
              )}
            </div>

            <Waveform
              peaks={waveformData}
              currentTime={deck.currentTime}
              duration={deck.duration}
              introTime={deck.introTime}
              outroTime={deck.outroTime}
              playedColor={playedColor}
              unplayedColor={unplayedColor}
              vinylMode={deck.vinylMode}
              onScratchStart={onScratchStart}
              onScratchMove={onScratchMove}
              onScratchEnd={onScratchEnd}
              onSeek={onSeek}
            />

            <div className="time-display">
              <span>{formatTime(deck.currentTime)} / {formatTime(deck.duration)}</span>
              <span style={{ color: `var(--neon-${accentColor})` }}>
                {(deck.track.bpm * (1 + deck.pitch / 100)).toFixed(1)} BPM
              </span>
            </div>
          </div>

          <div className="deck-controls-row">
            <button 
              onClick={onTogglePlay} 
              className={`play-btn ${deck.isPlaying ? 'active' : ''}`}
            >
              {deck.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button 
              onClick={onJumpToOutro}
              className={`load-deck-btn load-deck-btn-${deckId.toLowerCase()}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <SkipForward size={12} /> Test Outro
            </button>

            <div className="pitch-slider-container">
              <div className="pitch-label-row">
                <span>Pitch Fader</span>
                <span className="pitch-val">{deck.pitch > 0 ? '+' : ''}{deck.pitch.toFixed(1)}%</span>
              </div>
              <input 
                type="range" 
                min="-10" 
                max="10" 
                step="0.1"
                value={deck.pitch} 
                onChange={(e) => onPitchChange(e.target.value)}
                className="pitch-slider"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="deck-empty">
          <Disc size={48} />
          <p style={{ marginTop: '0.5rem' }}>Carga un tema en Deck {deckId}</p>
        </div>
      )}
    </section>
  )
}
