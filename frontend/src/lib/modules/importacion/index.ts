/**
 * Módulo Importacion — F7 (construir-interfaz) del proyecto 3D.
 * CONVERSOR multi-formato (chat_tool): importa STL/3MF/GCODE y lee metadatos.
 * Store MQTT `importacion` + panel Svelte. Operación puntual desde el chat, con
 * feedback por señal en_progreso → importada(✅)/fallida(❌). CERO juicio.
 */
import type { UIModule } from '$lib/ui-core';
import ImportacionPanel from './ImportacionPanel.svelte';

export const importacionModule: UIModule = {
  manifest: {
    id: 'importacion',
    name: 'Importación',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'importacion-btn',
      icon: '📥',
      label: 'Importar',
      action: { type: 'panel', panelId: 'importacion-panel' },
      order: 13
    },
    panels: [{
      id: 'importacion-panel',
      title: 'Importación de modelos',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: ImportacionPanel
};

export default importacionModule;

export { default as ImportacionPanel } from './ImportacionPanel.svelte';
