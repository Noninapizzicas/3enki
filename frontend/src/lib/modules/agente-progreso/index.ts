/**
 * Módulo UI agente-progreso — el progreso en vivo del agente.
 *
 * Dos pieles del mismo store (agente-progreso.ts, MQTT conversation/+/agent_*):
 * 1. AgenteMarco — desplegable dentro del chat (aparece solo cuando un agente
 *    trabaja, se actualiza con lo que devuelve, colapsable).
 * 2. AgenteProgreso — la ventana completa (ruta /[project_id]/agentes o panel).
 *
 * Autodescubierto por modules/loader.ts (import.meta.glob de manifest.json +
 * index.ts) — el patrón REAL del frontend: sin estos dos archivos el módulo
 * NO se registra (lección: agente-progreso vivía sin manifest → el sistema
 * no lo conocía como entidad).
 */

import type { UIModule } from '$lib/ui-core';
import AgenteProgresoPanel from './AgenteProgresoPanel.svelte';

export const agenteProgresoModule: UIModule = {
  manifest: {
    id: 'agente-progreso',
    name: 'Agente',
    version: '1.0.0',
    zone: 'system-bar',
    button: {
      id: 'agente-progreso-btn',
      icon: '🗺️',
      label: 'Agente',
      action: { type: 'panel', panelId: 'agente-progreso-panel' },
      order: 98
    },
    panels: [{
      id: 'agente-progreso-panel',
      title: 'Agente',
      size: 'lg'
    }]
  },
  PanelComponent: AgenteProgresoPanel
};

export default agenteProgresoModule;

export { default as AgenteProgreso } from './AgenteProgreso.svelte';
export { default as AgenteProgresoPanel } from './AgenteProgresoPanel.svelte';
export { default as AgenteMarco } from './AgenteMarco.svelte';
