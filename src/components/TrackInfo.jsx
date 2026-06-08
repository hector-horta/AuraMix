import React from 'react'
import { Trash2 } from 'lucide-react'
import { areKeysCompatible } from '../utils/audioAnalyzer'
import './TrackInfo.css'

export default function TrackInfo({
  track,
  activeTrack,
  deckA,
  deckB,
  onLoadTrack,
  onDeleteTrack
}) {
  // Compatibility flags with current playing track
  let isCompatBpm = false;
  let isCompatKey = false;
  
  if (activeTrack) {
    const bpmDiffPercent = Math.abs(track.bpm - activeTrack.bpm) / activeTrack.bpm;
    isCompatBpm = bpmDiffPercent <= 0.016;
    isCompatKey = areKeysCompatible(track.key, activeTrack.key);
  }

  const isLoadedOnA = deckA.track?.id === track.id;
  const isLoadedOnB = deckB.track?.id === track.id;
  const isCurrentTrack = activeTrack?.id === track.id;
  const isIncompatible = activeTrack && !isCurrentTrack && !(isCompatBpm && isCompatKey);

  return (
    <div 
      className={`track-item ${isLoadedOnA ? 'playing-a' : ''} ${isLoadedOnB ? 'playing-b' : ''} ${isIncompatible ? 'track-incompatible' : ''}`}
    >
      <div className="track-item-main">
        <div className="track-item-title-group">
          <p className="track-item-title">{track.title}</p>
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

        {/* Compatibility badge */}
        {activeTrack && activeTrack.id !== track.id && (
          <span className={`compatibility-status ${isCompatBpm && isCompatKey ? 'status-compatible' : 'status-incompatible'}`}>
            {isCompatBpm && isCompatKey ? "✓ Compatible" : "Incompatible"}
          </span>
        )}

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
