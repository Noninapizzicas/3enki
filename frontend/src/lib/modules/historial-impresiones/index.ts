/**
 * Módulo Historial Impresiones — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'historial-impresiones' alimentado por su blueprint (historial-impresiones.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import HistorialImpresionesPanel from './HistorialImpresionesPanel.svelte';

export const historialImpresionesModule: UIModule = {
  manifest: {
    id: 'historial-impresiones',
    name: 'Historial',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'historial-impresiones-btn',
      icon: '📜',
      label: 'Historial',
      action: { type: 'panel', panelId: 'historial-impresiones-panel' },
      order: 25
    },
    panels: [{
      id: 'historial-impresiones-panel',
      title: 'Historial',
      size: 'lg'
    }]
  },
  PanelComponent: HistorialImpresionesPanel
};

export default historialImpresionesModule;

export { default as HistorialImpresionesPanel } from './HistorialImpresionesPanel.svelte';
