/**
 * Módulo Carta Scheduler (Programacion)
 *
 * Programacion de cambios de carta+canal por franja horaria: reglas activas +
 * cambios pendientes de confirmar antes de aplicar (guardrail OK humano).
 * UI solo lectura (Postura B) — las mutaciones (crear_regla, eliminar_regla,
 * confirmar, rechazar, detectar_conflictos, proximos_cambios) las dispara el
 * chat via prefillChatInput. Panel router con tabs reglas|pendientes (D1),
 * 1 boton work-bar (D2), ConflictosBanner top si hay conflictos (D3).
 *
 * Autodescubierto por el loader (import.meta.glob de manifest.json + index.ts);
 * no requiere registro manual.
 *
 * Plan: arquitectura/decisiones/propuestas/cierre-ui-carta-scheduler.json
 */

import type { UIModule } from '$lib/ui-core';
import CartaSchedulerPanel from './CartaSchedulerPanel.svelte';

export const cartaSchedulerModule: UIModule = {
  manifest: {
    id: 'carta-scheduler',
    name: 'Programacion',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-scheduler-btn',
      icon: '📅',
      label: 'Programacion',
      action: { type: 'panel', panelId: 'carta-scheduler-panel' },
      order: 9
    },
    panels: [
      {
        id: 'carta-scheduler-panel',
        title: 'Programacion',
        size: 'lg'
      }
    ]
  },
  PanelComponent: CartaSchedulerPanel
};

export default cartaSchedulerModule;

// Re-export component for direct use
export { default as CartaSchedulerPanel } from './CartaSchedulerPanel.svelte';

// Re-export store (solo lectura) para conveniencia
export {
  reglasStore,
  pendientesStore,
  reglasActivas,
  conflictosDetectados,
  reglasLoading,
  pendientesLoading,
  cartaSchedulerError,
  loadReglas,
  loadPendientes,
  initCartaSchedulerSubscriptions,
  type Regla,
  type Pendiente,
  type Conflicto
} from '$lib/stores/carta-scheduler';
