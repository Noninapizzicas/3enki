/**
 * Módulo Carta Digital — panel del JEFE v2 (ciclo v2 #9, F7).
 *
 * El JEFE gestiona el ESCAPARATE público (PWA): declara el config del canal,
 * revisa el dictamen visual (preview iframe srcdoc) y ejecuta PUBLICAR.
 * Molde: entrega/variaciones/facturas (ciclo v2).
 *
 * El panel antiguo de 3 zonas (CartaDigitalPanel + IdentidadZone/OpcionesZone/
 * CartaCompuestaZone) SOBREVIVE en el repo y sigue exportado — consumidores
 * externos verificados: ContenidoPanel.svelte importa cartaPublica/
 * loadCartaPublica/initCartaDigitalSubscriptions de $lib/stores/carta-digital
 * (store intacto). El botón del módulo abre ahora el panel del jefe.
 */

import type { UIModule } from '$lib/ui-core';
import CartaDigitalJefePanel from './CartaDigitalJefePanel.svelte';

export const cartaDigitalModule: UIModule = {
  manifest: {
    id: 'carta-digital',
    name: 'Carta digital',
    version: '2.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-digital-btn',
      icon: '📱',
      label: 'Carta digital',
      action: { type: 'panel', panelId: 'carta-digital-jefe-panel' },
      order: 6
    },
    panels: [
      {
        id: 'carta-digital-jefe-panel',
        title: 'Carta digital — el escaparate',
        size: 'lg'
      }
    ]
  },
  PanelComponent: CartaDigitalJefePanel
};

export default cartaDigitalModule;

// Panel del jefe (nuevo)
export { default as CartaDigitalJefePanel } from './CartaDigitalJefePanel.svelte';

// Panel antiguo + zonas — siguen exportables (no se rompe nada existente)
export { default as CartaDigitalPanel } from './CartaDigitalPanel.svelte';
export { default as IdentidadZone } from './IdentidadZone.svelte';
export { default as OpcionesZone } from './OpcionesZone.svelte';
export { default as CartaCompuestaZone } from './CartaCompuestaZone.svelte';

// Store legacy exports (ContenidoPanel y amigos — intactos)
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

// Store del jefe (nuevo, ciclo v2)
export {
  configStore,
  disenoStore,
  proyeccionStore,
  extrasSinPrecio,
  cinta,
  loadInforme,
  loadConfig,
  loadDiseno,
  loadProyeccion,
  resetCartaDigitalJefe,
  declararConfig,
  dictaminarPreview,
  publicarCarta,
  initCartaDigitalJefeSubscriptions,
  ultimaPublicacion,
  previewHtml,
  type ConfigCanal,
  type DisenoCanal,
  type PreviewDictamen,
  type DictamenPublicacion,
  type DictamenConfig
} from '$lib/stores/carta-digital-jefe';