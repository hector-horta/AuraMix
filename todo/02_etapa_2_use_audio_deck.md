# Etapa 2: Descomposición de `useAudioDeck.js`

## Objetivo
Reducir `useAudioDeck.js` de 546 líneas a ~180 líneas extrayendo la animación del timer en tiempo real (`requestAnimationFrame`) y la gestión de loops en sub-hooks especializados. Refactorizar el proxy ref de scratch para evitar re-crear getters/setters dinámicos en cada render.

---

## Tareas

- [ ] Crear `src/hooks/useDeckPlayback.js` (~120 líneas)
  - Extraer el loop `requestAnimationFrame` que actualiza `currentTime`.
  - Manejo de fin de canción (`onPlaybackEnded`).
  - Verificación de límites en tiempo real.

- [ ] Crear `src/hooks/useDeckLoop.js` (~90 líneas)
  - Lógica de activación, desactivación y redimensionamiento de loops rítmicos (`toggleDeckLoop`).
  - Cálculo de barras a partir de BPM y `firstBeatOffset`.

- [ ] Simplificar `scratchEngine.js` & proxies en `useAudioDeck.js`
  - Eliminar los proxy getters dinámicos de `scratchRefs` (líneas 66-107 en `useAudioDeck.js`).
  - Pasar referencias directas o simplificar la firma de invocación de scratch.

- [ ] Refactorizar `src/hooks/useAudioDeck.js`
  - Mantener únicamente: estado central del deck, creación e inicialización de nodos Web Audio (`audioGraph.js`), métodos `loadTrack`, `playDeckSource`, `stopDeckSource`, `seekTo`, `updatePitch`, `handleVolumeChange` y `handleEqChange`.

---

## Verificación
1. Ejecutar `npx vite build`.
2. Probar reproducción/pausa en Deck A y B.
3. Probar scratch en la forma de onda / AuraPad.
4. Probar activación de loops de 1, 2, 4, 8 barras.
