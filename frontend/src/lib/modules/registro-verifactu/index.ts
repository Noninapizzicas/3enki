/**
 * Módulo Registro Verifactu — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'registro-verifactu' alimentado por su blueprint (registro-verifactu.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import RegistroVerifactuPanel from './RegistroVerifactuPanel.svelte';

export const registroVerifactuModule: UIModule = {
  manifest: {
    id: 'registro-verifactu',
    name: 'Registro Verifactu',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'registro-verifactu-btn',
      icon: '🧾',
      label: 'Verifactu',
      action: { type: 'panel', panelId: 'registro-verifactu-panel' },
      order: 81
    },
    panels: [{
      id: 'registro-verifactu-panel',
      title: 'Registro Verifactu',
      size: 'lg'
    }]
  },
  PanelComponent: RegistroVerifactuPanel
};

export default registroVerifactuModule;

export { default as RegistroVerifactuPanel } from './RegistroVerifactuPanel.svelte';
