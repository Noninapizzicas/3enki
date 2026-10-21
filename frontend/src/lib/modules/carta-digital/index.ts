/**
 * Módulo Carta Digital v1.0.0
 *
 * Backoffice de la carta pública del cliente final (PWA bajo /shop/<slug>).
 * 3 zonas apiladas (Postura B, solo lectura + prefill chat):
 * - IdentidadZone: branding + contacto del local
 * - OpcionesZone: opciones de visualización (colapsable)
 * - CartaCompuestaZone: carta compuesta con render tabular + badge desfasada + acciones
 */

import type { UIModule } from '$lib/ui-core';
import CartaDigitalPanel from './CartaDigitalPanel.svelte';

export const cartaDigitalModule: UIModule = {
  manifest: {
    id: 'carta-digital',
    name: 'Carta digital',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-digital-btn',
      icon: '📱',
      label: 'Carta digital',
      action: { type: 'panel', panelId: 'carta-digital-panel' },
      order: 6
    },
    panels: [{
      id: 'carta-digital-panel',
      title: 'Carta digital',
      size: 'lg'
    }]
  },
  PanelComponent: CartaDigitalPanel
};

export default cartaDigitalModule;

// Main panel + zonas
export { default as CartaDigitalPanel } from './CartaDigitalPanel.svelte';
export { default as IdentidadZone } from './IdentidadZone.svelte';
export { default as OpcionesZone } from './OpcionesZone.svelte';
export { default as CartaCompuestaZone } from './CartaCompuestaZone.svelte';

// Store exports
export {
  cartaPublica,
  cartaDigitalConfig,
  cartaDigitalLoading,
  cartaDigitalError,
  loadCartaPublica,
  loadCartaDigitalConfig,
  updateCartaDigitalConfig,
  initCartaDigitalSubscriptions,
  type CartaPublica,
  type CartaDigitalConfig,
  type BrandingProyectado
} from '$lib/stores/carta-digital';
