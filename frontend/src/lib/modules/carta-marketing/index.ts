/**
 * Módulo Carta Marketing v2.0.0 — el PERFIL DE MARCA del proyecto.
 *
 * La cara del JEFE sobre la identidad de marca (voz + visual + público +
 * esencia) que beben carta-digital, carta-design, copy y canales. Informe
 * get_perfil (la marca vigente por secciones) + editor-bloque update_perfil
 * (deep-merge por sección, gate AJV contra marca.schema.json).
 *
 * Components:
 * - CartaMarketingPanel: panel del jefe (informe + 4 editor-bloque)
 */

import type { UIModule } from '$lib/ui-core';
import CartaMarketingPanel from './CartaMarketingPanel.svelte';

export const cartaMarketingModule: UIModule = {
  manifest: {
    id: 'carta-marketing',
    name: 'Perfil de Marca',
    version: '2.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-marketing-btn',
      icon: '🎨',
      label: 'Marca',
      action: { type: 'panel', panelId: 'carta-marketing-panel' },
      order: 1
    },
    panels: [{
      id: 'carta-marketing-panel',
      title: 'Perfil de Marca',
      size: 'lg'
    }]
  },
  PanelComponent: CartaMarketingPanel
};

export default cartaMarketingModule;

export { default as CartaMarketingPanel } from './CartaMarketingPanel.svelte';
