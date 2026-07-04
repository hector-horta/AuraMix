import React, { useEffect, useState } from 'react'
import { Disc, X } from 'lucide-react'
import './AutoloadToast.css'

export default function AutoloadToast({ notification, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!notification) {
      setVisible(false);
      setExiting(false);
      return;
    }

    setExiting(false);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      handleDismiss();
    }, 6000);

    return () => clearTimeout(timer);
  }, [notification?.timestamp]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      if (onDismiss) onDismiss();
    }, 400);
  };

  if (!notification) return null;

  const { deckId, track } = notification;
  const deckColor = deckId === 'A' ? 'cyan' : 'pink';

  return (
    <div className={`autoload-toast ${visible ? 'toast-visible' : ''} ${exiting ? 'toast-exit' : ''} toast-deck-${deckColor}`}>
      <div className="toast-icon-wrapper">
        <Disc size={16} className="toast-icon-spin" />
      </div>
      <div className="toast-content">
        <span className="toast-label">CARGA AUTOMÁTICA</span>
        <span className="toast-track-name">{track?.title || 'Tema desconocido'}</span>
        <span className="toast-deck-label">→ Deck {deckId}</span>
      </div>
      <button className="toast-dismiss-btn" onClick={handleDismiss} title="Cerrar">
        <X size={14} />
      </button>
    </div>
  )
}
