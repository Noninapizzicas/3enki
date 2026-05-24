/**
 * Related Pages Module — barra lateral de paginas relacionadas (cajones Fase 5 bis).
 *
 * Aparece como boton en system-bar. Click → abre panel flotante con lista de
 * paginas relacionadas (consumes + consumed_by del grafo del page activo).
 *
 * Arquitectura modular canonica del repo (ver contexto/ui.json):
 * - 1 click = 1 panel flotante.
 * - Manifest + index + Panel siguiendo patron de credentials.
 * - Datos via mqttRequest('page', 'related', {page_id}) → ai-gateway responde.
 *
 * Zona: system-bar
 * MQTT:
 *   - publishes: ui/request/page/related (via mqttRequest desde el Panel)
 *   - subscribes: (ninguno — el listener de chat.foco.cambiado vive en
 *     stores/chat.ts para que aplique aunque el panel no este montado)
 *
 * Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json
 */

import type { UIModule } from '$lib/ui-core';
import RelatedPagesPanel from './RelatedPagesPanel.svelte';

export const relatedPagesModule: UIModule = {
  manifest: {
    id: 'related-pages',
    name: 'Páginas relacionadas',
    version: '1.0.0',
    zone: 'system-bar',
    button: {
      id: 'related-pages-btn',
      icon: '🧭',
      label: 'Páginas relacionadas',
      action: { type: 'panel', panelId: 'related-pages' },
      order: 99
    },
    panels: [
      {
        id: 'related-pages',
        title: 'Páginas relacionadas',
        size: 'sm'
      }
    ],
    mqtt: {
      publishes: [],
      subscribes: []
    }
  },

  PanelComponent: RelatedPagesPanel
};

export default relatedPagesModule;
export { default as RelatedPagesPanel } from './RelatedPagesPanel.svelte';
