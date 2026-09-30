/**
 * Módulo Normalizador de hechos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'normalizador-hecho' alimentado por su blueprint (normalizador-hecho.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import NormalizadorHechoPanel from './NormalizadorHechoPanel.svelte';

export const normalizadorHechoModule: UIModule = {
  manifest: {
    id: 'normalizador-hecho',
    name: 'Normalizador de hechos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'normalizador-hecho-btn',
      icon: '📥',
      label: 'Normalizar',
      action: { type: 'panel', panelId: 'normalizador-hecho-panel' },
      order: 43
    },
    panels: [{
      id: 'normalizador-hecho-panel',
      title: 'Normalizador de hechos',
      size: 'lg'
    }]
  },
  PanelComponent: NormalizadorHechoPanel
};

export default normalizadorHechoModule;

export { default as NormalizadorHechoPanel } from './NormalizadorHechoPanel.svelte';
