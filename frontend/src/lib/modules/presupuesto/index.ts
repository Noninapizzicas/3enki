/**
 * Módulo Presupuesto — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'presupuesto' alimentado por su blueprint (presupuesto.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PresupuestoPanel from './PresupuestoPanel.svelte';

export const PresupuestoModule: UIModule = {
  manifest: {
    id: 'presupuesto',
    name: 'Presupuesto',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'presupuesto-btn',
      icon: '🎯',
      label: 'Presupuesto',
      action: { type: 'panel', panelId: 'presupuesto-panel' },
      order: 14
    },
    panels: [{
      id: 'presupuesto-panel',
      title: 'Presupuesto',
      size: 'lg'
    }]
  },
  PanelComponent: PresupuestoPanel
};

export default PresupuestoModule;

export { default as PresupuestoPanel } from './PresupuestoPanel.svelte';
