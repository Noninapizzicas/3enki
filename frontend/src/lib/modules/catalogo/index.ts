/**
 * Módulo Catalogo — F7 (construir-interfaz) del proyecto 3D.
 * CUSTODIO de la biblioteca de piezas (cara OPERADOR). Store MQTT `catalogo`
 * + panel Svelte con vista biblioteca/registro/edición/detalle. Moneda real
 * multiformato: archivo_stl / archivo_3mf / archivo_gcode conviven.
 */
import type { UIModule } from '$lib/ui-core';
import CatalogoPanel from './CatalogoPanel.svelte';

export const catalogoModule: UIModule = {
  manifest: {
    id: 'catalogo',
    name: 'Catálogo 3D',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'catalogo-btn',
      icon: '🧊',
      label: 'Catálogo',
      action: { type: 'panel', panelId: 'catalogo-panel' },
      order: 8
    },
    panels: [{
      id: 'catalogo-panel',
      title: 'Catálogo de piezas',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: CatalogoPanel
};

export default catalogoModule;

export { default as CatalogoPanel } from './CatalogoPanel.svelte';
