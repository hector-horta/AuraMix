import React from 'react'
import { Disc } from 'lucide-react'
import ActivityLog from './ActivityLog'
import './CamelotPanel.css'

export default function CamelotPanel({
  activeTrack,
  autoDj,
  transitionState,
  logs,
  onAutoDjToggle
}) {
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
    <section className="panel camelot-panel">
      <div>
        <h2 className="camelot-title" style={{ marginBottom: '0.75rem' }}>Dashboard Camelot</h2>
        
        {activeTrack ? (
          <div className="active-camelot-card">
            <div className="active-camelot-key">{activeKey}</div>
            <div className="active-camelot-name">{activeTrack.keyName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Tema en vivo: "{activeTrack.title}"
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', margin: '0.75rem 0', paddingTop: '0.5rem' }}>
              <p className="eq-knob-label" style={{ marginBottom: '0.5rem', textAlign: 'left' }}>Tonalidades Compatibles:</p>
              
              <div className="compatibility-wheel-mini">
                {wheelSlots.map((slot, i) => (
                  <div 
                    key={i} 
                    className={`wheel-slot ${slot.isCenter ? 'wheel-slot-center' : slot.isCompat ? 'wheel-slot-compat' : ''}`}
                  >
                    <span style={{ fontWeight: 'bold' }}>{slot.key}</span>
                    <span className="wheel-slot-label">{slot.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="active-camelot-card active-camelot-card-empty">
            Haz sonar una canción para ver la rueda de compatibilidad armónica.
          </div>
        )}
      </div>

      {/* Compatibility explanation */}
      <div className="panel" style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
        <div className="compatibility-guide">
          <span className="eq-knob-label" style={{ fontWeight: 'bold' }}>Guía Armónica (Regla de Mezcla)</span>
          <p style={{ fontSize: '0.7rem' }}>Para transiciones fluidas sin disonancia armónica, mezcla canciones cuya clave sea:</p>
          <div className="guide-item">
            <div className="guide-dot dot-same"></div>
            <span>Misma tonalidad (ej. 8A ➔ 8A)</span>
          </div>
          <div className="guide-item">
            <div className="guide-dot dot-adjacent"></div>
            <span>Código contiguo en la rueda (ej. 8A ➔ 9A o 7A)</span>
          </div>
          <div className="guide-item">
            <div className="guide-dot dot-relative"></div>
            <span>Cambio de escala Relativa Mayor/Menor (ej. 8A ➔ 8B)</span>
          </div>
        </div>
      </div>

      {/* Auto-DJ Controls & Activity Logs */}
      <div className="autodj-controls">
        <div className="autodj-header">
          <div className="autodj-title-group">
            <Disc className="autodj-icon" size={16} />
            <span>Auto-DJ Inteligente</span>
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
        
        <p className="autodj-status-text">
          {autoDj 
            ? "El motor monitorea las salidas de los temas y cargará + sincronizará automáticamente la siguiente pista compatible." 
            : "Control manual activo. Eres responsable de sincronizar y disparar las mezclas."}
        </p>

        {/* Live transition warning */}
        {transitionState.active && (
          <div className="autodj-transition-alert">
            ¡TRANSMISIÓN EN CURSO! ({transitionState.phase.toUpperCase()})
          </div>
        )}
      </div>

      {/* Activity Logger */}
      <ActivityLog logs={logs} />
    </section>
  )
}
