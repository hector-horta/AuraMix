import { useState, useCallback } from 'react';
import {
  decodeAudioFile,
  decodeAudioFromUrl,
  detectBPM,
  detectKey,
  detectOutro,
  detectIntro,
  detectHighsPosition
} from '../utils/audioAnalyzer';
import { parseFilename } from '../utils/fileAnalyzer';
import { DEMO_TRACKS } from '../constants/demoTracks';

/**
 * Custom Hook: useLibraryManager
 * Encapsulates track library state, file uploads, online demo loading, and track analysis.
 */
export function useLibraryManager({ initAudio, addLog }) {
  const [library, setLibrary] = useState([]);
  const [analyzingFile, setAnalyzingFile] = useState(null);
  const [analyzingProgress, setAnalyzingProgress] = useState("");

  const updateTrackCuePoints = useCallback((trackId, introTime, outroTime, cueTime) => {
    setLibrary(prev => prev.map(track => {
      if (track.id === trackId) {
        return {
          ...track,
          intro: introTime !== undefined ? introTime : track.intro,
          outro: outroTime !== undefined ? outroTime : track.outro,
          cue: cueTime !== undefined ? cueTime : track.cue
        };
      }
      return track;
    }));
  }, []);

  const handleFileUpload = useCallback(async (e) => {
    if (e.preventDefault) e.preventDefault();
    const files = e.target?.files 
      ? Array.from(e.target.files) 
      : Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    const ctx = initAudio();

    for (const file of files) {
      setAnalyzingFile(file.name);
      setAnalyzingProgress("Cargando y decodificando audio...");
      addLog(`Cargando archivo: "${file.name}"...`);

      try {
        const decodedBuffer = await decodeAudioFile(file, ctx);
        
        setAnalyzingProgress("Analizando tempo (BPM)...");
        const bpmData = await detectBPM(decodedBuffer);
        const bpm = bpmData.bpm;
        const firstBeatOffset = bpmData.firstBeatOffset;
        
        setAnalyzingProgress("Detectando escala musical...");
        const keyData = await detectKey(decodedBuffer);
        
        setAnalyzingProgress("Detectando punto de salida (Outro)...");
        const outroTime = detectOutro(decodedBuffer);

        setAnalyzingProgress("Detectando punto de entrada (Intro)...");
        const introTime = detectIntro(decodedBuffer, bpm);

        setAnalyzingProgress("Analizando posición de agudos...");
        const highsPosition = await detectHighsPosition(decodedBuffer);

        const { artist, title } = parseFilename(file.name);

        const newTrack = {
          id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          title: title,
          artist: artist,
          bpm: bpm,
          key: keyData.camelot,
          keyName: keyData.keyName,
          outro: outroTime,
          intro: introTime,
          highsPosition: highsPosition,
          cue: 0,
          firstBeatOffset: firstBeatOffset,
          duration: decodedBuffer.duration,
          buffer: decodedBuffer,
          isDemo: false
        };

        setLibrary(prev => [newTrack, ...prev]);
        addLog(`Analizado con éxito: "${newTrack.title}" (${bpm} BPM, Tono: ${keyData.camelot}, Intro/Drop: ${introTime.toFixed(1)}s, Outro: ${outroTime.toFixed(1)}s)`);
      } catch (err) {
        console.error(err);
        addLog(`Error analizando "${file.name}": ${err.message}`);
      }
    }
    
    setAnalyzingFile(null);
    setAnalyzingProgress("");
  }, [initAudio, addLog]);

  const loadDemoTrack = useCallback(async (demoTrack) => {
    const ctx = initAudio();
    
    setAnalyzingFile(demoTrack.title);
    setAnalyzingProgress("Descargando de internet y decodificando...");
    addLog(`Cargando pista demo: "${demoTrack.title}"...`);

    try {
      const decodedBuffer = await decodeAudioFromUrl(demoTrack.url, ctx);
      
      setAnalyzingProgress("Analizando tempo (BPM)...");
      const bpmData = await detectBPM(decodedBuffer);
      const bpm = bpmData.bpm;
      const firstBeatOffset = bpmData.firstBeatOffset;
      
      setAnalyzingProgress("Analizando tono (Camelot)...");
      const keyData = await detectKey(decodedBuffer);
      
      setAnalyzingProgress("Analizando outro...");
      const outroTime = detectOutro(decodedBuffer);

      setAnalyzingProgress("Analizando intro...");
      const introTime = detectIntro(decodedBuffer, bpm);

      setAnalyzingProgress("Analizando agudos...");
      const highsPosition = await detectHighsPosition(decodedBuffer);

      const analyzedTrack = {
        ...demoTrack,
        bpm: demoTrack.bpm !== undefined ? demoTrack.bpm : bpm,
        key: demoTrack.key !== undefined ? demoTrack.key : keyData.camelot,
        keyName: demoTrack.keyName !== undefined ? keyData.keyName : keyData.keyName,
        outro: demoTrack.outro !== undefined ? demoTrack.outro : outroTime,
        intro: demoTrack.intro !== undefined ? demoTrack.intro : introTime,
        cue: demoTrack.cue !== undefined ? demoTrack.cue : 0,
        firstBeatOffset: demoTrack.firstBeatOffset !== undefined ? demoTrack.firstBeatOffset : firstBeatOffset,
        highsPosition: demoTrack.highsPosition !== undefined ? demoTrack.highsPosition : highsPosition,
        duration: decodedBuffer.duration,
        buffer: decodedBuffer
      };

      setLibrary(prev => {
        const cleaned = prev.filter(t => t.id !== demoTrack.id);
        return [...cleaned, analyzedTrack];
      });

      addLog(`Demo cargada con éxito: "${analyzedTrack.title}" (${bpm} BPM, Tono: ${keyData.camelot}, Intro/Drop: ${introTime.toFixed(1)}s, Outro: ${outroTime.toFixed(1)}s)`);
    } catch (err) {
      console.error(err);
      addLog(`Error cargando demo: ${err.message}. Intentando fallback local.`);
      addLog(`Consejo: Sube tus propios archivos MP3 locales arrastrándolos aquí para saltar las restricciones de CORS.`);
    }
    
    setAnalyzingFile(null);
    setAnalyzingProgress("");
  }, [initAudio, addLog]);

  const loadAllDemos = useCallback(async () => {
    for (const track of DEMO_TRACKS) {
      await loadDemoTrack(track);
    }
  }, [loadDemoTrack]);

  const deleteTrack = useCallback((id, e) => {
    if (e) e.stopPropagation();
    setLibrary(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearLibrary = useCallback(() => {
    setLibrary([]);
    addLog("Biblioteca vaciada.");
  }, [addLog]);

  return {
    library,
    analyzingFile,
    analyzingProgress,
    updateTrackCuePoints,
    handleFileUpload,
    loadDemoTrack,
    loadAllDemos,
    deleteTrack,
    clearLibrary
  };
}
