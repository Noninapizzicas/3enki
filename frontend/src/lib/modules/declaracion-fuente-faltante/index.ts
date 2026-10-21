/**
 * Módulo Declaración de fuente faltante — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'declaracion-fuente-faltante' alimentado por su blueprint (declaracion-fuente-faltante.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import DeclaracionFuenteFaltantePanel from './DeclaracionFuenteFaltantePanel.svelte';

export const declaracionFuenteFaltanteModule: UIModule = {
  manifest: {
    id: 'declaracion-fuente-faltante',
    name: 'Declaración de fuente faltante',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'declaracion-fuente-faltante-btn',
      icon: '❓',
      label: 'Fuente faltante',
      action: { type: 'panel', panelId: 'declaracion-fuente-faltante-panel' },
      order: 41
    },
    panels: [{
      id: 'declaracion-fuente-faltante-panel',
      title: 'Declaración de fuente faltante',
      size: 'lg'
    }]
  },
  PanelComponent: DeclaracionFuenteFaltantePanel
};

export default declaracionFuenteFaltanteModule;

export { default as DeclaracionFuenteFaltantePanel } from './DeclaracionFuenteFaltantePanel.svelte';
