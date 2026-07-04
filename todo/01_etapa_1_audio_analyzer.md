# Etapa 1: Modularización de `audioAnalyzer.js`

## Objetivo
Desacoplar el archivo monolítico `src/utils/audioAnalyzer.js` (592 líneas) en 4 módulos independientes con funciones puras sin efectos secundarios.

---

## Tareas

- [ ] Crear `src/utils/analyzers/bpmDetector.js` (~120 líneas)
  - Extraer `detectBPM(buffer)`
  - Algoritmo de filtrado de energía, detección de picos y estimación de offset del primer golpe (`firstBeatOffset`)

- [ ] Crear `src/utils/analyzers/keyDetector.js` (~150 líneas)
  - Extraer `detectKey(buffer)`
  - Cálculo de Chromagrama (FFT/autocorrelación de frecuencias), asignación a perfiles Krumhansl-Schmuckler y conversión a código Camelot (ej. `8A`, `11B`).

- [ ] Crear `src/utils/analyzers/structureDetector.js` (~120 líneas)
  - Extraer `detectOutro(buffer)`
  - Extraer `detectIntro(buffer, bpm)`
  - Extraer `detectHighsPosition(buffer)`

- [ ] Crear `src/utils/analyzers/keyMatcher.js` (~60 líneas)
  - Extraer `areKeysCompatible(keyA, keyB)`
  - Reglas de compatibilidad Camelot (misma clave, +/- 1 número en rueda, o cambio de escala A/B).

- [ ] Refactorizar `src/utils/audioAnalyzer.js`
  - Convertirlo en un archivo de re-exportación transparente para mantener compatibilidad sin romper imports existentes en la app.

---

## Verificación
1. Ejecutar `npx vite build` para asegurar 0 errores de importación.
2. Probar la subida de un archivo MP3 en la interfaz para verificar que la detección de BPM, Key, Intro, Outro y Agudos funcione exactamente igual.
