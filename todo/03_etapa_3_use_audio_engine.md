# Etapa 3: Descomposición de `useAudioEngine.js` (Core Refactor)

## Objetivo
Resolver la causa principal de bugs y stale closures en la aplicación. Reducir `useAudioEngine.js` de 709 líneas a ~150 líneas convirtiéndolo en una fachada delgada y clara, delegando el trabajo pesado a sub-hooks con responsabilidad única.

---

## Tareas

- [x] Crear `src/hooks/useTransitionController.js` (~160 líneas)
  - Extraer `triggerAutomatedTransition`.
  - Extraer programación de rampa de volumen, EQ swap, bassline swap y jukebox transition.
  - Gestión del estado `transitionState` (`active`, `phase`, `progress`).
  - Limpieza de `transitionTimeoutsRef`.

- [x] Crear `src/hooks/useAutoloadManager.js` (~110 líneas)
  - Extraer inicialización y manejo del `autoloadScheduler`.
  - Manejo de estados `autoloadCountdown` (segundos restantes por deck) y `autoloadNotification` (toast).
  - Eliminación de dependencias circulares con `loadTrackIntoDeckRef`.

- [x] Crear `src/hooks/useSessionTimer.js` (~50 líneas)
  - Extraer el temporizador de tiempo transcurrido de la sesión (`sessionElapsedTime`).

- [x] Refactorizar `useAudioEngine.js`
  - Reorganizar como orquestador primario:
    - Instanciar `deckA` y `deckB`.
    - Usar `useTransitionController`.
    - Usar `useAutoloadManager`.
    - Usar `useSessionTimer`.
  - Eliminar los parches de `useRef` obsoletos (`deckARef`, `deckBRef`, `libraryRef`, `djModeRef`, etc.) reemplazándolos con pasajes limpios de parámetros a las funciones de dominio.

---

## Verificación
1. Ejecutar `npx vite build`.
2. Probar mezcla en AutoDJ mode (EQ Rampa y Bass Swap).
3. Probar mezcla en Jukebox mode.
4. Verificar la cuenta regresiva del Autoload (color amarillo tape stop) y la auto-carga al llegar a 0.
5. Verificar el toast de notificación al auto-cargar.
