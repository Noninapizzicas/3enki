/**
 * Módulo Cuentas bancarias — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'maestro-cuentas-bancarias' alimentado por su blueprint (maestro-cuentas-bancarias.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MaestroCuentasBancariasPanel from './MaestroCuentasBancariasPanel.svelte';

export const maestroCuentasBancariasModule: UIModule = {
  manifest: {
    id: 'maestro-cuentas-bancarias',
    name: 'Cuentas bancarias',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'maestro-cuentas-bancarias-btn',
      icon: '🏦',
      label: 'Bancos',
      action: { type: 'panel', panelId: 'maestro-cuentas-bancarias-panel' },
      order: 91
    },
    panels: [{
      id: 'maestro-cuentas-bancarias-panel',
      title: 'Cuentas bancarias',
      size: 'lg'
    }]
  },
  PanelComponent: MaestroCuentasBancariasPanel
};

export default maestroCuentasBancariasModule;

export { default as MaestroCuentasBancariasPanel } from './MaestroCuentasBancariasPanel.svelte';
