import React from 'react';
import { Info } from 'lucide-react';
import './HarmonyWheel.css';

/**
 * Component: HarmonyWheel
 * Displays Camelot Wheel harmonic compatibility matrix for the active track.
 */
export default function HarmonyWheel({ activeTrack }) {
  const activeKey = activeTrack ? activeTrack.key : null;

  const getWheelCompatSlots = () => {
    if (!activeKey) return Array(4).fill({ key: "-", label: "", isCompat: false });
    
    const num = parseInt(activeKey.slice(0, -1), 10);
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
  );
}
