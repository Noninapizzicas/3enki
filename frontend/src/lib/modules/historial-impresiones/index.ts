/**
 * Módulo Historial-Impresiones — panel ESPECÍFICO de la cinta cronológica (F7, prisma-universal).
 *
 * A diferencia del envoltorio genérico (BlueprintForm), este índice exporta el UIModule
 * con un componente artesanal (HistorialImpresionesPanel.svelte) y su store MQTT
 * (stores/historial.ts), siguiendo la práctica iniciada en catalogo-modelos (2ª iteración).
 *
 * MATIZ CLAVE — el jefe es LECTOR: `listar` es su único gesto (cinta cronológica + total).
 * `registrar` es rol neutro/sistema (lo invoca ciclo-impresion o entra por impresion.completada);
 * el panel NO lo expone como botón del jefe. Autodescubierto por el loader
 * (import.meta.glob de manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import HistorialImpresionesPanel from './HistorialImpresionesPanel.svelte';

export const historialImpresionesModule: UIModule = {
  manifest: {
    id: 'historial-impresiones',
    name: 'Historial de impresiones',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'historial-impresiones-btn',
      icon: '🖨️',
      label: 'Historial 3D',
      action: { type: 'panel', panelId: 'historial-impresiones-panel' },
      order: 8
    },
    panels: [{
      id: 'historial-impresiones-panel',
      title: 'Historial de impresiones',
      size: 'lg'
    }]
  },
  PanelComponent: HistorialImpresionesPanel
};

export default historialImpresionesModule;

export { default as HistorialImpresionesPanel } from './HistorialImpresionesPanel.svelte';
