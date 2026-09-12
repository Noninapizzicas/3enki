/**
 * Módulo Ciclo-Impresion — panel ESPECÍFICO de ESTADO de la MÁQUINA DE ESTADOS
 * del ciclo de impresión 3D (F7, prisma-universal, 4ª iteración de la práctica).
 *
 * A diferencia del envoltorio genérico (BlueprintForm), este índice exporta el
 * UIModule con un componente artesanal (CicloImpresionPanel.svelte) y su store
 * MQTT (stores/ciclo.ts), siguiendo la práctica iniciada en catalogo-modelos,
 * historial-impresiones y cola-impresion.
 *
 * MATIZ CLAVE — es un panel de ESTADO, no una cinta CRUD. El jefe OBSERVA la
 * máquina de estados del ciclo (8 estados, index.js) y CONFIRMA las transiciones
 * físicas que requieren su mano. El estado se RECONSTRUYE suscribiéndose a las
 * señales publicadas por el orquestador (NO hay RPC lectora de estado — hueco
 * [ABIERTO] del esquema-jefe). Las 3 confirmaciones contextuales NO son RPC del
 * módulo: se entregan por el evento adaptador-confirmacion.confirmacion_recibida
 * (onConfirmacionRecibida del ciclo); ver notas [ABIERTO] en stores/ciclo.ts.
 *
 * NOTA F7: el module.json de ciclo-impresion NO tenía ui_handlers, pero `iniciar`
 * es la UNICA RPC real del módulo (onIniciarRequest → _iniciar). Se declara en
 * este F7 (domain 'ciclo-impresion') para que mqttRequest('ciclo-impresion',
 * 'iniciar', …) llegue a ese handler vía ui/request/ciclo-impresion/iniciar.
 * Autodescubierto por el loader (import.meta.glob de manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import CicloImpresionPanel from './CicloImpresionPanel.svelte';

export const cicloImpresionModule: UIModule = {
  manifest: {
    id: 'ciclo-impresion',
    name: 'Ciclo de impresión',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'ciclo-impresion-btn',
      icon: '⏱️',
      label: 'Ciclo 3D',
      action: { type: 'panel', panelId: 'ciclo-impresion-panel' },
      order: 8
    },
    panels: [{
      id: 'ciclo-impresion-panel',
      title: 'Ciclo de impresión',
      size: 'lg'
    }]
  },
  PanelComponent: CicloImpresionPanel
};

export default cicloImpresionModule;

export { default as CicloImpresionPanel } from './CicloImpresionPanel.svelte';
