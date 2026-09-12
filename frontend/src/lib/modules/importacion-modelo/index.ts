/**
 * Módulo Importacion-Modelo — panel ESPECÍFICO del JEFE que IMPORTA modelos 3D
 * al taller (F7, prisma-universal, 5ª y ÚLTIMA iteración de la práctica de la
 * vertical 3D).
 *
 * A diferencia del envoltorio genérico (BlueprintForm), este índice exporta el
 * UIModule con un componente artesanal (ImportacionModeloJefePanel.svelte) y
 * su store MQTT (stores/importacion.ts), siguiendo la práctica iniciada en
 * catalogo-modelos, historial-impresiones, cola-impresion y ciclo-impresion.
 *
 * MATIZ CLAVE — el jefe aquí EJERCE una acción (importar), no lee listas. El
 * módulo es un PUENTE stateless: NO hay lista de "mis importaciones" (los
 * modelos importados viven en catalogo-modelos). El panel es un FORMULARIO DE
 * ACCIÓN (editor-bloque: url + origen + categoría [+ nombre]) + feedback de la
 * señal pareada (en_progreso → importada/fallida).
 *
 * NOTA F7: el module.json de importacion-modelo NO tenía ui_handlers, y
 * importar es la ÚNICA RPC real del módulo (onImportarRequest → _importar). Se
 * declara en este F7 (domain 'importacion-modelo') en el module.json backend
 * para que mqttRequest('importacion-modelo', 'importar', …) llegue a ese
 * handler vía ui/request/importacion-modelo/importar. La búsqueda previa
 * (_buscar) NO es handler RPC de este módulo (delega a busqueda-repositorios)
 * — NO se inventa onBuscar ni se cablea. Autodescubierto por el loader
 * (import.meta.glob de manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import ImportacionModeloJefePanel from './ImportacionModeloJefePanel.svelte';

export const importacionModeloModule: UIModule = {
  manifest: {
    id: 'importacion-modelo',
    name: 'Importar modelo 3D',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'importacion-modelo-btn',
      icon: '📥',
      label: 'Importar 3D',
      action: { type: 'panel', panelId: 'importacion-modelo-panel' },
      order: 8
    },
    panels: [{
      id: 'importacion-modelo-panel',
      title: 'Importar modelo 3D',
      size: 'lg'
    }]
  },
  PanelComponent: ImportacionModeloJefePanel
};

export default importacionModeloModule;

export { default as ImportacionModeloJefePanel } from './ImportacionModeloJefePanel.svelte';
