/**
 * Módulo Consulta de cuentas — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'consulta-cuentas-bajo-demanda' alimentado por su blueprint (consulta-cuentas-bajo-demanda.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ConsultaCuentasBajoDemandaPanel from './ConsultaCuentasBajoDemandaPanel.svelte';

export const consultaCuentasBajoDemandaModule: UIModule = {
  manifest: {
    id: 'consulta-cuentas-bajo-demanda',
    name: 'Consulta de cuentas',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'consulta-cuentas-bajo-demanda-btn',
      icon: '📋',
      label: 'Consultar',
      action: { type: 'panel', panelId: 'consulta-cuentas-bajo-demanda-panel' },
      order: 302
    },
    panels: [{
      id: 'consulta-cuentas-bajo-demanda-panel',
      title: 'Consulta de cuentas',
      size: 'lg'
    }]
  },
  PanelComponent: ConsultaCuentasBajoDemandaPanel
};

export default consultaCuentasBajoDemandaModule;

export { default as ConsultaCuentasBajoDemandaPanel } from './ConsultaCuentasBajoDemandaPanel.svelte';
