# Etapa 4: Desacoplamiento de Componentes UI y App.jsx

## Objetivo
Limpiar la capa de presentación de la aplicación, desacoplando la gestión de archivos e interfaz en `App.jsx`, separando la rueda armónica en `MixMaster.jsx` y modularizando los archivos CSS sobrecargados.

---

## Tareas

- [x] Crear `src/hooks/useLibraryManager.js` (~110 líneas)
  - Extraer manejo de la biblioteca de canciones (`library`).
  - Extraer flujo de upload de archivos locales (`handleFileUpload`) y análisis.
  - Extraer carga de demos en línea (`loadDemoTrack`, `loadAllDemos`).
  - Extraer eliminación y vaciado de biblioteca.

- [x] Crear `src/components/HarmonyWheel.jsx` (~80 líneas)
  - Extraer la grilla de claves compatibles (anterior, actual, siguiente, relativa) que actualmente vive en `MixMaster.jsx` (líneas 71-91 y 222-281).

- [x] Simplificar `src/App.jsx`
  - Reducir de 336 a ~120 líneas.
  - Dejar a `App.jsx` únicamente la estructura general del layout y pasar props a `Header`, `LibraryPanel`, `MixMaster`, `Deck` y `MixerPanel`.

- [x] Modularizar CSS masivos
  - Dividir `MixMaster.css` (698 líneas) extrayendo `HarmonyWheel.css` y `EqOrderPills.css`.

---

## Verificación Final
1. Ejecutar `npx vite build`.
2. Probar la aplicación de principio a fin:
   - Cargar demos / subir canciones propias.
   - Reproducción en Decks A y B.
   - Transición Auto-DJ / Jukebox / Manual.
   - Auto-carga de canciones con countdown y toast.
   - FX AuraPad y AuraLoops.
