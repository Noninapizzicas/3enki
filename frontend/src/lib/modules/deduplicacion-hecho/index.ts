/**
 * Módulo Deduplicación de hechos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'deduplicacion-hecho' alimentado por su blueprint (deduplicacion-hecho.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import DeduplicacionHechoPanel from './DeduplicacionHechoPanel.svelte';

export const deduplicacionHechoModule: UIModule = {
  manifest: {
    id: 'deduplicacion-hecho',
    name: 'Deduplicación de hechos',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'deduplicacion-hecho-btn',
      icon: '⚙️',
      label: 'Deduplicar',
      action: { type: 'panel', panelId: 'deduplicacion-hecho-panel' },
      order: 206
    },
    panels: [{
      id: 'deduplicacion-hecho-panel',
      title: 'Deduplicación de hechos',
      size: 'lg'
    }]
  },
  PanelComponent: DeduplicacionHechoPanel
};

export default deduplicacionHechoModule;

export { default as DeduplicacionHechoPanel } from './DeduplicacionHechoPanel.svelte';
