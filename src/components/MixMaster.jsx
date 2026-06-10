import React, { useRef, useState, useEffect } from 'react'
import { Sliders, Music, Clock, Disc, Info } from 'lucide-react'
import { formatTime } from '../utils/formatTime'
import EqOrderPills from './EqOrderPills'
import './MixMaster.css'

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
      }, 1200); // flicker lasts 1.2s then stays solid
      return () => clearTimeout(flickerTimer);
    } else if (wasActive && !isActive) {
      // Transition just ended — play fade-out
      setNeonAnim('turning-off');
      const fadeTimer = setTimeout(() => {
        setNeonAnim('inactive');
      }, 1500); // fade-out lasts 1.5s
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

      {/* Primary Row (Line 2): Controls on the left, precedence and alerts on the right */}
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
                onChange={(e) => onChangeMasterBpm(parseInt(e.target.value))}
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
                    const val = parseInt(e.target.value);
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
            <div className="info-tooltip-container">
              <Info size={13} className="harmony-info-icon" />
              <div className="harmony-tooltip-content">
                <span className="tooltip-title">Guía Armónica (Regla de Mezcla)</span>
                <p>Para transiciones fluidas sin disonancia armónica, mezcla canciones cuya clave sea:</p>
                <div className="tooltip-guide-item">
                  <div className="tooltip-dot dot-same"></div>
                  <span>Misma tonalidad (ej. 8A ➔ 8A)</span>
                </div>
                <div className="tooltip-guide-item">
                  <div className="tooltip-dot dot-adjacent"></div>
                  <span>Código contiguo en la rueda (ej. 8A ➔ 9A o 7A)</span>
                </div>
                <div className="tooltip-guide-item">
                  <div className="tooltip-dot dot-relative"></div>
                  <span>Cambio de escala Relativa Mayor/Menor (ej. 8A ➔ 8B)</span>
                </div>
              </div>
            </div>
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
