import React from 'react'
import { Play, Pause, SkipForward, Disc } from 'lucide-react'
import Waveform from './Waveform'
import { formatTime } from '../utils/formatTime'
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
  accentColor
}) {
  const isCyan = accentColor === 'cyan';
  const playedColor = isCyan ? '#00f0ff' : '#ff007f';
  const unplayedColor = isCyan ? '#17496e' : '#6d1844';

  return (
    <section className={`panel deck deck-${deckId.toLowerCase()} ${isActive ? `panel-active-${accentColor}` : ''}`}>
      <div className="deck-header">
        <span className="deck-label">Deck {deckId}</span>
        {deck.track && (
          <span className="deck-key-display">{deck.track.key}</span>
        )}
      </div>

      {deck.track ? (
        <>
          <div className="track-info">
            <h3 className="track-title">{deck.track.title}</h3>
            <p className="track-artist">{deck.track.artist}</p>
          </div>

          <Waveform
            peaks={waveformData}
            currentTime={deck.currentTime}
            duration={deck.duration}
            introTime={deck.introTime}
            outroTime={deck.outroTime}
            playedColor={playedColor}
            unplayedColor={unplayedColor}
            onSeek={onSeek}
          />

          <div className="time-display">
            <span>{formatTime(deck.currentTime)} / {formatTime(deck.duration)}</span>
            <span style={{ color: `var(--neon-${accentColor})` }}>
              {(deck.track.bpm * (1 + deck.pitch / 100)).toFixed(1)} BPM
            </span>
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
                min="-20" 
                max="20" 
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
