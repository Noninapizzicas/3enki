/**
 * Módulo Trazo — el BORDE del 6º sentido de enki-sense.
 *
 * Clase 3 del bisturí (HARDWARE DE BORDE): la captura del gesto vive SIEMPRE en
 * el cliente. Este módulo abre un canvas donde dibujas con el dedo/ratón; al
 * interpretar, manda los trazos al motor-trazo (Rust nativo, geometría pura) vía
 *   mqttRequest('motor-trazo', 'interpretar', { trazos })
 * y muestra la GEOMETRÍA que devuelve. La INTENCIÓN (qué quisiste dibujar) no la
 * adivina el motor — la lees tú (o el LLM al recibir la geometría).
 *
 * Universal: es un sentido, no una página de dominio → se ve en CUALQUIER
 * proyecto (sobrevive al gate de page-set vacío, como interruptores).
 */

import type { UIModule } from '$lib/ui-core';
import TrazoPanel from './TrazoPanel.svelte';

export const trazoModule: UIModule = {
  manifest: {
    id: 'trazo',
    name: 'Trazo',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'trazo-btn',
      icon: '✏️',
      label: 'Trazo',
      action: { type: 'panel', panelId: 'trazo-panel' },
      order: 98
    },
    panels: [{
      id: 'trazo-panel',
      title: 'Trazo — dibuja y el motor lee su forma',
      size: 'lg'
    }]
  },
  PanelComponent: TrazoPanel
};

export default trazoModule;

export { default as TrazoPanel } from './TrazoPanel.svelte';
