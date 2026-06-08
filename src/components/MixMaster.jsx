import React from 'react'
import { Sliders, Music, Clock, Disc } from 'lucide-react'
import { formatTime } from '../utils/formatTime'
import './MixMaster.css'

export default function MixMaster({
  masterBpm,
  onChangeMasterBpm,
  library,
  autoDj,
  onAutoDjToggle,
  sessionElapsedTime,
  activeTrack
}) {
  // Calculate playlist stats
  const totalTracks = library.length;
  const totalDuration = library.reduce((acc, track) => acc + (track.duration || 0), 0);

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
      { key: `${prevNum}${letter}`, label: "Prev", isCompat: true },
      { key: `${num}${letter}`, label: "Act", isCenter: true },
      { key: `${nextNum}${letter}`, label: "Sig", isCompat: true },
      { key: `${num}${oppositeLetter}`, label: "Rel", isCompat: true }
    ];
  };

  const wheelSlots = getWheelCompatSlots();

  return (
    <div className="panel mix-master-panel">
      {/* Col 1: Title & Auto-DJ Toggle */}
      <div className="mix-master-col mix-master-main">
        <div className="mix-master-header">
          <Disc className={`mix-master-icon ${autoDj ? 'autodj-icon-spinning' : ''}`} size={20} />
          <span className="mix-master-title">MIX MASTER</span>
        </div>
        <div className="autodj-toggle-container">
          <span className="autodj-toggle-label">Auto-DJ</span>
          <label className="switch">
            <input 
              type="checkbox" 
              checked={autoDj} 
              onChange={onAutoDjToggle}
            />
            <span className="slider-toggle"></span>
          </label>
        </div>
      </div>

      {/* Col 2: BPM Control */}
      <div className="mix-master-col mix-master-bpm">
        <div className="bpm-info-group">
          <Sliders style={{ color: 'var(--neon-pink)' }} size={16} />
          <span className="section-label">BPM MASTER</span>
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

      {/* Col 3: Stats */}
      <div className="mix-master-col mix-master-stats">
        <div className="stats-header">
          <Music size={16} className="stats-icon-cyan" />
          <span className="section-label">PLAYLIST: {totalTracks} PISTAS</span>
        </div>
        <div className="stats-time-row">
          <Clock size={14} className="stats-icon-muted" />
          <div className="time-display">
            <span className="time-elapsed">{formatTime(sessionElapsedTime)}</span>
            <span className="time-divider">/</span>
            <span className="time-total">{formatTime(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Col 4: Compatible keys */}
      <div className="mix-master-col mix-master-harmony">
        <span className="section-label section-label-harmony">CLAVES COMPATIBLES</span>
        {activeTrack ? (
          <div className="compatibility-wheel-horizontal">
            {wheelSlots.map((slot, i) => (
              <div 
                key={i} 
                className={`wheel-slot-horizontal ${slot.isCenter ? 'slot-center' : slot.isCompat ? 'slot-compat' : ''}`}
              >
                <span className="slot-key">{slot.key}</span>
                <span className="slot-label">{slot.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="harmony-placeholder">Esperando tema en vivo...</span>
        )}
      </div>
    </div>
  )
}
