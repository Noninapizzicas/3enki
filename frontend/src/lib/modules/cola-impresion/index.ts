/**
 * Módulo Cola-Impresion — panel ESPECÍFICO de la CINTA DE LA COLA + MANO DEL JEFE (F7, prisma-universal).
 *
 * A diferencia del envoltorio genérico (BlueprintForm), este índice exporta el UIModule
 * con un componente artesanal (ColaImpresionPanel.svelte) y su store MQTT
 * (stores/cola.ts), siguiendo la práctica iniciada en catalogo-modelos e
 * historial-impresiones (3ª iteración).
 *
 * MATIZ CLAVE — el jefe aquí ESCRIBE + REORDENA + DISPARA: `entrar` (la escritura
 * clave del custodio), `reordenar` (la mano del dueño sobre la prioridad del motor
 * _ordenar, SOLO pendientes) y `siguiente` (disparador de la cara de decisión fría
 * "qué imprime ahora"). `listar`/`longitud` son lecturas neutras que alimentan la
 * cinta. NOTA F7: el module.json de cola-impresion NO tenía ui_handlers — se
 * declaran en este F7 (domain 'cola-impresion') para que mqttRequest('cola-impresion', …)
 * llegue a los handlers reales (onListarRequest/onEntrarRequest/onSiguienteRequest/
 * onReordenarRequest/onLongitudRequest) vía ui/request/cola-impresion/<accion>.
 * Autodescubierto por el loader (import.meta.glob de manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import ColaImpresionPanel from './ColaImpresionPanel.svelte';

export const colaImpresionModule: UIModule = {
  manifest: {
    id: 'cola-impresion',
    name: 'Cola de impresión',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cola-impresion-btn',
      icon: '🖨️',
      label: 'Cola 3D',
      action: { type: 'panel', panelId: 'cola-impresion-panel' },
      order: 8
    },
    panels: [{
      id: 'cola-impresion-panel',
      title: 'Cola de impresión',
      size: 'lg'
    }]
  },
  PanelComponent: ColaImpresionPanel
};

export default colaImpresionModule;

export { default as ColaImpresionPanel } from './ColaImpresionPanel.svelte';
