# Diagnóstico General de Complejidad y Arquitectura

## Resumen Ejecutivo
El proyecto Moodsic presenta archivos de gran tamaño y alta complejidad ciclomática que violan las mejores prácticas de desarrollo en JavaScript y React. Esto ha producido bugs recurrentes por **stale closures**, acoplamiento rígido y dificultad para agregar nuevas funcionalidades sin romper otras existentes.

---

## 1. Métricas de Tamaño Actuales

| Archivo | Líneas | Estado | Responsabilidades Mezcladas |
|---|---|---|---|
| `src/hooks/useAudioEngine.js` | 709 | 🔴 Crítico | AudioContext, Auto-DJ transitions, Sync, Autoload scheduler, Session timers, FX bridge |
| `src/components/MixMaster.css` | 698 | 🟠 Alto | Estilos acoplados con animaciones inline de neon |
| `src/utils/audioAnalyzer.js` | 592 | 🔴 Crítico | Detección de BPM, Tonalidad Camelot, Intro/Outro, Agudos, Compatibilidad |
| `src/hooks/useAudioDeck.js` | 546 | 🔴 Crítico | Web Audio API lifecycle, rAF loop, Scratch proxy refs, Loops, Pitch, Cues |
| `src/components/MixerPanel.css` | 331 | 🟡 Medio | Estilos de mixer y faders |
| `src/App.jsx` | 336 | 🟡 Medio | File upload, Web audio decode, Library state, UI layout wiring |
| `src/components/Deck.css` | 302 | 🟡 Medio | Estilos de decks |
| `src/components/MixMaster.jsx` | 285 | 🟡 Medio | Harmony wheel calculation, Neon alert state, Stats grid |

---

## 2. Buenas Prácticas para JavaScript y React

- **Largo Máximo por Archivo (Hooks / Componentes React)**: **150 - 250 líneas**. Archivos de más de 300 líneas deben dividirse en sub-hooks o componentes secundarios.
- **Largo Máximo por Archivo (Módulos JS puros / Utils)**: **100 - 200 líneas**. Módulos masivos como `audioAnalyzer.js` deben desacoplarse en utilidades especializadas con responsabilidad única.
- **Complejidad Ciclomática**: Ninguna función debe tener una profundidad de anidamiento condicional superior a 3 niveles.
- **Sincronización Web Audio vs. React**:
  - Web Audio corre en tiempo real en un hilo desacoplado.
  - React actualiza estado de forma asíncrona.
  - Mezclar ambos en un hook monolítico genera **Stale Closures** (callbacks/timers capturando estado viejo de renders pasados), obligando a plagar el código de `useRef` mirrors (`deckARef`, `libraryRef`, `loadTrackIntoDeckRef`, etc.).

---

## 3. Hoja de Ruta de Refactorización (Etapas)

| Etapa | Archivo TODO | Descripción | Riesgo |
|---|---|---|---|
| Etapa 1 | `todo/01_etapa_1_audio_analyzer.md` | Modularización de `audioAnalyzer.js` en sub-analizadores puros | 🟢 Bajo |
| Etapa 2 | `todo/02_etapa_2_use_audio_deck.md` | Descomposición de `useAudioDeck.js` (rAF playback y loops) | 🟡 Medio |
| Etapa 3 | `todo/03_etapa_3_use_audio_engine.md` | Descomposición de `useAudioEngine.js` en sub-hooks de dominio | 🔴 Alto (Crucial) |
| Etapa 4 | `todo/04_etapa_4_ui_app_cleanup.md` | Desacoplamiento de `App.jsx`, `MixMaster.jsx` y biblioteca | 🟢 Bajo |
