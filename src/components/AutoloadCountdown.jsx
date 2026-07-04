import React, { useState, useEffect, useRef } from 'react'
import './AutoloadCountdown.css'

export default function AutoloadCountdown({ secondsLeft }) {
  const [displayNum, setDisplayNum] = useState(secondsLeft);
  const [prevNum, setPrevNum] = useState(null);
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (secondsLeft === displayNum) return;

    // Start animation: old number exits up, new number enters from below
    setPrevNum(displayNum);
    setDisplayNum(secondsLeft);
    setAnimating(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setAnimating(false);
      setPrevNum(null);
    }, 400); // animation duration

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [secondsLeft]);

  if (secondsLeft === null || secondsLeft === undefined) return null;

  return (
    <div className="autoload-countdown" title="Carga automática en progreso">
      <span className="countdown-label">AUTO</span>
      <div className="countdown-number-container">
        {/* Exiting number (slides up with blur) */}
        {animating && prevNum !== null && (
          <span key={`exit-${prevNum}`} className="countdown-number countdown-exit">
            {prevNum}
          </span>
        )}
        {/* Entering number (slides in from below with blur) */}
        <span 
          key={`enter-${displayNum}`} 
          className={`countdown-number ${animating ? 'countdown-enter' : 'countdown-idle'}`}
        >
          {displayNum}
        </span>
      </div>
      <span className="countdown-unit">s</span>
    </div>
  )
}
