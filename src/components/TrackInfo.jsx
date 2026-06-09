import React from 'react'
import { Trash2 } from 'lucide-react'
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
  const isIncompatible = activeTrack && !isCurrentTrack && !(isCompatBpm && isCompatKey);
  const isCompatible = activeTrack && !isCurrentTrack && isCompatBpm && isCompatKey;

  const playedRatio = libraryLength > 0 ? playedTrackIds.length / libraryLength : 0;

  return (
    <div 
      className={`track-item ${isLoadedOnA ? 'playing-a' : ''} ${isLoadedOnB ? 'playing-b' : ''} ${isIncompatible ? 'track-incompatible' : ''} ${isCompatible ? 'track-compatible' : ''}`}
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
          {isIncompatible && (
            <span className="badge-incompatible" title="Incompatible con la canción en reproducción (BPM o Tono diferente)">✗</span>
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
