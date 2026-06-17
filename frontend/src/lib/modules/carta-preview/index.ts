/**
 * Módulo Preview PWA — vista previa del PWA sin dominio (carta pública).
 *
 * Pide a cartadigital.preview el HTML real (generateStaticHTML, variante suelta)
 * y lo renderiza en un iframe con toggle móvil/escritorio. Es lo que ve el cliente,
 * no una maqueta.
 */

import type { UIModule } from '$lib/ui-core';
import CartaPreviewPanel from './CartaPreviewPanel.svelte';

export const cartaPreviewModule: UIModule = {
  manifest: {
    id: 'carta-preview',
    name: 'Preview PWA',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-preview-btn',
      icon: '👁',
      label: 'Preview',
      action: { type: 'panel', panelId: 'carta-preview-panel' },
      order: 6
    },
    panels: [{
      id: 'carta-preview-panel',
      title: 'Preview PWA',
      size: 'lg'
    }]
  },
  PanelComponent: CartaPreviewPanel
};

export default cartaPreviewModule;

export { default as CartaPreviewPanel } from './CartaPreviewPanel.svelte';
