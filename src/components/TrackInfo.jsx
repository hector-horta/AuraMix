import React, { useState, useEffect } from 'react'
import { Trash2, Clock } from 'lucide-react'
import { areKeysCompatible } from '../utils/audioAnalyzer'
import './TrackInfo.css'

export default function TrackInfo({
  track,
  activeTrack,
  deckA,
  deckB,
  playedTrackIds = [],
  libraryLength = 0,
  djMode,
  onLoadTrack,
  onDeleteTrack
}) {
  const [isNew, setIsNew] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsNew(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Compatibility flags with current playing track
  let isCompatBpm = false;
  let isCompatKey = false;
  
  if (activeTrack) {
    const bpmDiffPercent = Math.abs(track.bpm - activeTrack.bpm) / activeTrack.bpm;
    isCompatBpm = djMode === 'jukebox' ? true : (bpmDiffPercent <= 0.05);
    isCompatKey = areKeysCompatible(track.key, activeTrack.key);
  }

  const isLoadedOnA = deckA.track?.id === track.id;
  const isLoadedOnB = deckB.track?.id === track.id;
  const isCurrentTrack = activeTrack?.id === track.id;
  
  // Actual compatibility calculation (used for badges next to delete button)
  const isActuallyIncompatible = activeTrack && !isCurrentTrack && !(isCompatBpm && isCompatKey);
  const isActuallyCompatible = activeTrack && !isCurrentTrack && isCompatBpm && isCompatKey;

  const outroDuration = activeTrack ? (activeTrack.duration - activeTrack.outro) : 0;
  const introDuration = track.intro || 16.0;
  const isTimeMatch = djMode !== 'jukebox' && activeTrack && !isCurrentTrack && (Math.abs(introDuration - outroDuration) <= 5);

  // Visual classes showing compatibility status (lights up all as compatible in manual mode)
  const isIncompatible = djMode === 'manual' ? false : isActuallyIncompatible;
  const isCompatible = djMode === 'manual' ? (activeTrack && !isCurrentTrack) : isActuallyCompatible;

  const playedRatio = libraryLength > 0 ? playedTrackIds.length / libraryLength : 0;

  return (
    <div 
      className={`track-item ${isNew ? 'track-item-new' : ''} ${isLoadedOnA ? 'playing-a' : ''} ${isLoadedOnB ? 'playing-b' : ''} ${isIncompatible ? 'track-incompatible' : ''} ${isCompatible ? 'track-compatible' : ''}`}
    >
      <div className="track-item-main">
        <div className="track-item-title-group">
          <p className="track-item-title">
            {track.title}
          </p>
          <p className="track-item-artist">{track.artist}</p>
        </div>
        <div className="track-item-meta">
          {track.isDemo && <span className="meta-badge badge-demo">Demo</span>}
          <span className="meta-badge badge-bpm">{track.bpm} BPM</span>
          <span className="meta-badge badge-key">{track.key}</span>
        </div>
      </div>
      
      <div className="track-item-actions">
        <div className="load-buttons">
          <button 
            disabled={isLoadedOnA || isLoadedOnB}
            onClick={() => onLoadTrack(track, 'A')}
            className="load-deck-btn load-deck-btn-a"
          >
            Deck A
          </button>
          <button 
            disabled={isLoadedOnA || isLoadedOnB}
            onClick={() => onLoadTrack(track, 'B')}
            className="load-deck-btn load-deck-btn-b"
          >
            Deck B
          </button>
        </div>

        <div className="track-status-badges" style={{ marginLeft: 'auto', marginRight: '0.5rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {playedTrackIds.includes(track.id) && (
            playedRatio >= 0.75 ? (
              <span className="played-warning-badge" title="Esta canción ya ha sido reproducida, pero es elegible porque se agotó el 75% de la biblioteca">!</span>
            ) : (
              <span className="played-checkmark-badge" title="Esta canción ya ha sido reproducida en la sesión">✓</span>
            )
          )}
          {isTimeMatch && (
            <span className="badge-time-match" title={`¡Duración de transición compatible! El intro de esta canción (${introDuration.toFixed(1)}s) coincide con el outro de la activa (${outroDuration.toFixed(1)}s)`}>
              <Clock size={9} />
            </span>
          )}
        </div>

        <button 
          onClick={(e) => onDeleteTrack(track.id, e)}
          className="load-deck-btn"
          style={{ background: 'transparent', borderColor: 'transparent', padding: '0.2rem', color: 'var(--text-dark)' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
