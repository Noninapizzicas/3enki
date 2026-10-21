/**
 * Módulo Carta Design v2.0.0 — el COMPOSITOR del diseño impreso de la carta.
 *
 * La cara del JEFE sobre el look del PDF: elige la carta (ref-select) y
 * COMPONE el diseño (contexto_diseno → dictamen visual {carta, marca,
 * alergenos_catalogo}), luego VALIDA (freno) y GUARDA (save) el HTML. La
 * identidad del diseño sale de la MARCA (carta-marketing); la composición del
 * HTML la hace el LLM de página.
 *
 * Components:
 * - CartaDesignPanel: panel del jefe (ref-select carta + componer + validar +
 *   guardar + galería)
 */

import type { UIModule } from '$lib/ui-core';
import CartaDesignPanel from './CartaDesignPanel.svelte';

export const cartaDesignModule: UIModule = {
  manifest: {
    id: 'carta-design',
    name: 'Diseño de Carta',
    version: '2.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-design-btn',
      icon: '🖼️',
      label: 'Diseño',
      action: { type: 'panel', panelId: 'carta-design-panel' },
      order: 1
    },
    panels: [{
      id: 'carta-design-panel',
      title: 'Diseño de Carta',
      size: 'lg'
    }]
  },
  PanelComponent: CartaDesignPanel
};

export default cartaDesignModule;

export { default as CartaDesignPanel } from './CartaDesignPanel.svelte';
