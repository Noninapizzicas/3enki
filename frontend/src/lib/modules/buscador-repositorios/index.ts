/**
 * Módulo Buscador-Repositorios — F7 (construir-interfaz) del proyecto 3D.
 * PUENTE de búsqueda externa (chat_tool): busca en Printables/MakerWorld/etc.
 * Store MQTT `buscador-repositorios` + panel Svelte: input de búsqueda + resultados
 * como tarjetas (fuente/título/url/autor/formatos). NO inventa resultados.
 */
import type { UIModule } from '$lib/ui-core';
import BuscadorRepositoriosPanel from './BuscadorRepositoriosPanel.svelte';

export const buscadorRepositoriosModule: UIModule = {
  manifest: {
    id: 'buscador-repositorios',
    name: 'Buscar modelos',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'buscador-repositorios-btn',
      icon: '🔎',
      label: 'Buscar',
      action: { type: 'panel', panelId: 'buscador-repositorios-panel' },
      order: 12
    },
    panels: [{
      id: 'buscador-repositorios-panel',
      title: 'Buscar modelos 3D',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: BuscadorRepositoriosPanel
};

export default buscadorRepositoriosModule;

export { default as BuscadorRepositoriosPanel } from './BuscadorRepositoriosPanel.svelte';
