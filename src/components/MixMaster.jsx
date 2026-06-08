import React from 'react'
import { Sliders, Music, Clock, Disc } from 'lucide-react'
import { formatTime } from '../utils/formatTime'
import EqOrderPills from './EqOrderPills'
import './MixMaster.css'

export default function MixMaster({
  masterBpm,
  onChangeMasterBpm,
  library,
  autoDj,
  onAutoDjToggle,
  eqOrder,
  onEqOrderChange,
  sessionElapsedTime,
  activeTrack
}) {
  // Calculate playlist stats
  const totalTracks = library.length;
  const totalDuration = library.reduce((acc, track) => acc + (track.duration || 0), 0);
  const remainingTime = Math.max(0, totalDuration - sessionElapsedTime);

  // Compatible keys calculation
  const activeKey = activeTrack ? activeTrack.key : null;
  const getWheelCompatSlots = () => {
    if (!activeKey) return Array(4).fill({ key: "-", label: "", isCompat: false });
    
    const num = parseInt(activeKey.slice(0, -1));
    const letter = activeKey.slice(-1);

    const prevNum = num === 1 ? 12 : num - 1;
    const nextNum = num === 12 ? 1 : num + 1;
    const oppositeLetter = letter === 'A' ? 'B' : 'A';

    return [
      { key: `${prevNum}${letter}`, label: "Anterior", isCompat: true },
      { key: `${num}${letter}`, label: "Actual", isCenter: true },
      { key: `${nextNum}${letter}`, label: "Siguiente", isCompat: true },
      { key: `${num}${oppositeLetter}`, label: "Relativo", isCompat: true }
    ];
  };

  const wheelSlots = getWheelCompatSlots();

  return (
    <div className="panel mix-master-panel">
      {/* Title Header (Line 1) */}
      <div className="mix-master-header-row">
        <h2 className="mix-master-title-text">MIX MASTER</h2>
      </div>

      {/* Primary Row (Line 2): BPM Master & Auto-DJ switch */}
      <div className="mix-master-row mix-master-row-primary">
        {/* BPM Selector */}
        <div className="mix-master-bpm-container">
          <div className="bpm-info-group">
            <Sliders style={{ color: 'var(--neon-pink)' }} size={16} />
            <span className="section-label">BPM MASTER DE MEZCLA</span>
          </div>
          <div className="bpm-controls-row">
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

        {/* Auto-DJ Control */}
        <div className="mix-master-autodj-container">
          <div className="autodj-switch-wrapper">
            <div className="autodj-header-group">
              <Disc className={`mix-master-icon ${autoDj ? 'autodj-icon-spinning' : ''}`} size={16} />
              <span className="section-label">AUTO-DJ</span>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={autoDj} 
                onChange={onAutoDjToggle}
              />
              <span className="slider-toggle"></span>
            </label>
          </div>
          <EqOrderPills
            eqOrder={eqOrder}
            onOrderChange={onEqOrderChange}
            disabled={!autoDj}
          />
        </div>
      </div>

      {/* Secondary Row (Line 3): Playlist stats & Harmony wheel */}
      <div className="mix-master-row mix-master-row-secondary">
        {/* Playlist Stats */}
        <div className="mix-master-stats-container">
          <div className="stats-header-group">
            <Music size={16} className="stats-icon-cyan" />
            <span className="section-label">DATOS DEL PLAYLIST</span>
          </div>
          <div className="stats-info-grid">
            <div className="stats-info-item">
              <span className="stats-info-label">Canciones</span>
              <span className="stats-info-value">{totalTracks}</span>
            </div>
            <div className="stats-info-item">
              <span className="stats-info-label">Transcurrido</span>
              <span className="stats-info-value value-elapsed">{formatTime(sessionElapsedTime)}</span>
            </div>
            <div className="stats-info-item">
              <span className="stats-info-label">Restante</span>
              <span className="stats-info-value value-remaining">{formatTime(remainingTime)}</span>
            </div>
            <div className="stats-info-item">
              <span className="stats-info-label">Duración Total</span>
              <span className="stats-info-value">{formatTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Harmony Keys */}
        <div className="mix-master-harmony-container">
          <div className="harmony-header-group">
            <span className="section-label section-label-harmony">CLAVES COMPATIBLES</span>
          </div>
          {activeTrack ? (
            <div className="harmony-grid-layout">
              <div className="harmony-grid-slot slot-area-prev">
                <div className="wheel-slot-horizontal slot-compat">
                  <span className="slot-key">{wheelSlots[0].key}</span>
                  <span className="slot-label">{wheelSlots[0].label}</span>
                </div>
              </div>
              
              <div className="harmony-grid-slot slot-area-actual">
                <div className="wheel-slot-horizontal slot-center double-height">
                  <span className="slot-key key-large">{wheelSlots[1].key}</span>
                  <span className="slot-label label-large">{wheelSlots[1].label}</span>
                </div>
              </div>
              
              <div className="harmony-grid-slot slot-area-next">
                <div className="wheel-slot-horizontal slot-compat">
                  <span className="slot-key">{wheelSlots[2].key}</span>
                  <span className="slot-label">{wheelSlots[2].label}</span>
                </div>
              </div>
              
              <div className="harmony-grid-slot slot-area-rel">
                <div className="wheel-slot-horizontal slot-relative-key">
                  <span className="slot-key">{wheelSlots[3].key}</span>
                  <span className="slot-label">{wheelSlots[3].label}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="harmony-placeholder-container">
              <span className="harmony-placeholder">Esperando tema en vivo...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
