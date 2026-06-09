import React, { useRef, useEffect } from 'react'
import { formatTime } from '../utils/formatTime'
import './Waveform.css'

export default function Waveform({
  peaks,
  currentTime,
  duration,
  introTime,
  outroTime,
  playedColor,
  unplayedColor,
  onSeek
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);
    const progressLimit = duration > 0 ? (currentTime / duration) * width : 0;

    const barWidth = width / peaks.length;
    peaks.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = peak * height * 0.9;
      const y = (height - barHeight) / 2;

      if (x < progressLimit) {
        ctx.fillStyle = playedColor;
      } else {
        ctx.fillStyle = unplayedColor;
      }
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
  }, [peaks, currentTime, duration, playedColor, unplayedColor]);

  const handleContainerClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    onSeek(percent);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const introPercent = duration > 0 ? (introTime / duration) * 100 : 0;
  const outroPercent = duration > 0 ? (outroTime / duration) * 100 : 0;

  return (
    <div className="waveform-wrapper">
      {/* Cue time indicators outside the waveform */}
      {duration > 0 && introTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${introPercent}%` }}
        >
          {formatTime(introTime)}
        </span>
      )}
      {duration > 0 && outroTime > 0 && (
        <span 
          className="waveform-cue-time-badge"
          style={{ left: `${outroPercent}%` }}
        >
          {formatTime(outroTime)}
        </span>
      )}

      <div className="waveform-container" onClick={handleContainerClick}>
        {peaks ? (
          <canvas className="waveform-canvas" ref={canvasRef} />
        ) : (
          <div className="waveform-placeholder" />
        )}
        
        {/* Play progress bar */}
        <div className="waveform-progress-bar" style={{ left: `${progressPercent}%` }} />

        {/* Intro Cue marker */}
        {duration > 0 && introTime > 0 && (
          <>
            <div 
              className="intro-marker" 
              style={{ left: `${introPercent}%` }}
            />
            <span 
              className="intro-label"
              style={{ left: `${introPercent}%` }}
            >
              DROP
            </span>
          </>
        )}

        {/* Outro Cue marker */}
        {duration > 0 && outroTime > 0 && (
          <>
            <div 
              className="outro-marker" 
              style={{ left: `${outroPercent}%` }}
            />
            <span 
              className="outro-label"
              style={{ left: `${outroPercent}%` }}
            >
              OUTRO
            </span>
          </>
        )}
      </div>
    </div>
  )
}
