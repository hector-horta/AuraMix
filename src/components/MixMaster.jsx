import React, { useRef, useState, useEffect } from 'react';
import { Sliders, Music, Disc } from 'lucide-react';
import { formatTime } from '../utils/formatTime';
import EqOrderPills from './EqOrderPills';
import HarmonyWheel from './HarmonyWheel';
import './MixMaster.css';

export default function MixMaster({
  masterBpm,
  onChangeMasterBpm,
  library,
  djMode,
  onDjModeChange,
  eqOrder,
  onEqOrderChange,
  sessionElapsedTime,
  activeTrack,
  transitionState
}) {
  // Neon sign animation state tracking
  const prevActiveRef = useRef(false);
  const lastActivePhaseRef = useRef('aligning');
  const [neonAnim, setNeonAnim] = useState('inactive'); // 'inactive' | 'turning-on' | 'active' | 'turning-off'

  // Update last active phase when transition is running
  if (transitionState.active && transitionState.phase !== 'idle') {
    lastActivePhaseRef.current = transitionState.phase;
  }

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    const isActive = transitionState.active;
    prevActiveRef.current = isActive;

    if (!wasActive && isActive) {
      // Transition just started — play neon flicker-on
      setNeonAnim('turning-on');
      const flickerTimer = setTimeout(() => {
        setNeonAnim('active');
      }, 1200);
      return () => clearTimeout(flickerTimer);
    } else if (wasActive && !isActive) {
      // Transition just ended — play fade-out
      setNeonAnim('turning-off');
      const fadeTimer = setTimeout(() => {
        setNeonAnim('inactive');
      }, 1500);
      return () => clearTimeout(fadeTimer);
    }
  }, [transitionState.active]);

  // Build alert CSS class based on animation state
  const getAlertClass = () => {
    switch (neonAnim) {
      case 'turning-on':
        return `alert-phase-${transitionState.phase} alert-neon-on`;
      case 'active':
        return `alert-phase-${transitionState.phase}`;
      case 'turning-off':
        return `alert-phase-${lastActivePhaseRef.current} alert-neon-off`;
      case 'inactive':
      default:
        return 'alert-inactive';
    }
  };

  // Calculate playlist stats
  const totalTracks = library.length;
  const totalDuration = library.reduce((acc, track) => acc + (track.duration || 0), 0);
  const remainingTime = Math.max(0, totalDuration - sessionElapsedTime);

  return (
    <div className="panel mix-master-panel">
      {/* Title Header */}
      <div className="mix-master-header-row">
        <h2 className="mix-master-title-text">MIX MASTER</h2>
      </div>

      {/* Primary Row: Controls on the left, precedence and alerts on the right */}
      <div className="mix-master-row mix-master-row-primary">
        {/* Left Column: Controls (BPM Master & DJ Mode) */}
        <div className="mix-master-left-column">
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
                onChange={(e) => onChangeMasterBpm(parseInt(e.target.value, 10))}
                className="bpm-range-slider"
                disabled={djMode === 'jukebox'}
              />
              <div className="bpm-input-wrapper">
                <input 
                  type="number" 
                  min="75" 
                  max="150" 
                  value={masterBpm}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onChangeMasterBpm(Math.max(75, Math.min(150, val)));
                    }
                  }}
                  className="bpm-number-input"
                  disabled={djMode === 'jukebox'}
                />
                <span className="bpm-unit-text">BPM</span>
              </div>
            </div>
          </div>

          {/* DJ Mode Control */}
          <div className="autodj-switch-wrapper">
            <div className="autodj-header-group">
              <Disc className={`mix-master-icon ${djMode !== 'manual' ? 'autodj-icon-spinning' : ''}`} size={16} />
              <span className="section-label">MODO DE DJ</span>
            </div>
            
            {/* 3-way sliding selector */}
            <div className="autodj-mode-selector">
              <button 
                className={`mode-btn ${djMode === 'manual' ? 'active' : ''}`}
                onClick={() => onDjModeChange('manual')}
                title="Modo Manual: Control total sobre volumen EQs"
              >
                Manual
              </button>
              <button 
                className={`mode-btn ${djMode === 'autodj' ? 'active' : ''}`}
                onClick={() => onDjModeChange('autodj')}
                title="Auto-DJ: Mezcla automática inteligente con transición EQ de 3 fases"
              >
                AutoDJ
              </button>
              <button 
                className={`mode-btn ${djMode === 'jukebox' ? 'active' : ''}`}
                onClick={() => onDjModeChange('jukebox')}
                title="Modo Jukebox: Estación de radio con crossfade de volumen y rampa de tempo"
              >
                Jukebox
              </button>
              <div className={`mode-slider slide-${djMode}`} />
            </div>
          </div>
        </div>

        {/* Right Column: Precedence & Alerts */}
        <div className="mix-master-right-column">
          <EqOrderPills
            eqOrder={eqOrder}
            onOrderChange={onEqOrderChange}
            disabled={djMode !== 'autodj'}
          />
          <div className={`autodj-transition-alert ${getAlertClass()}`}>
            {neonAnim === 'inactive' ? (
              <>MEZCLA INACTIVA</>
            ) : neonAnim === 'turning-off' ? (
              <>MEZCLA INACTIVA</>
            ) : (
              <>MEZCLA EN CURSO ({transitionState.phase.toUpperCase()})</>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Row: Playlist stats & Harmony wheel */}
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

        {/* Harmony Keys Component */}
        <HarmonyWheel activeTrack={activeTrack} />
      </div>
    </div>
  );
}
