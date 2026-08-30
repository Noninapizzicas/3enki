/**
 * Módulo Técnicas — panel del JEFE v2 (ciclo v2 #408, F7).
 *
 * El JEFE gestiona el catálogo de técnicas culinarias del proyecto: LA ALTA
 * (codificar — nombre único, duplicado = ALREADY_EXISTS) y LA EVOLUCIÓN
 * (actualizar — 6 campos permitidos, version+1/history automáticos), con
 * dictamen por respuesta y señales propias tecnica.creada/actualizada.
 * Molde: entrega/carta-digital (ciclo v2).
 *
 * El panel generado del blueprint (TecnicasPanel + BlueprintForm) SOBREVIVE
 * en el repo y sigue exportado — el botón del módulo abre ahora el panel del
 * jefe (mismo patrón que carta-digital).
 */

import type { UIModule } from '$lib/ui-core';
import TecnicasJefePanel from './TecnicasJefePanel.svelte';

export const tecnicasModule: UIModule = {
  manifest: {
    id: 'tecnicas',
    name: 'Técnicas',
    version: '2.0.0',
    zone: 'work-bar',
    button: {
      id: 'tecnicas-btn',
      icon: '🍳',
      label: 'Técnicas',
      action: { type: 'panel', panelId: 'tecnicas-jefe-panel' },
      order: 9
    },
    panels: [{
      id: 'tecnicas-jefe-panel',
      title: 'Técnicas — el catálogo',
      size: 'lg'
    }]
  },
  PanelComponent: TecnicasJefePanel
};

export default tecnicasModule;

// Panel del jefe (nuevo)
export { default as TecnicasJefePanel } from './TecnicasJefePanel.svelte';

// Panel generado del blueprint — sigue exportable (no se rompe nada existente)
export { default as TecnicasPanel } from './TecnicasPanel.svelte';
