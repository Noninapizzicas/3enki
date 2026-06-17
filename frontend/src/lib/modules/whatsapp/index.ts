/**
 * Módulo WhatsApp — vincular el número del negocio (open-wa) por QR, desde la UI.
 *
 * Consume el backend openwa-service:
 *   ui/request whatsapp.estado | whatsapp.vincular | whatsapp.desvincular
 *   eventos    whatsapp.estado | whatsapp.qr   (live)
 */

import type { UIModule } from '$lib/ui-core';
import WhatsappPanel from './WhatsappPanel.svelte';

export const whatsappModule: UIModule = {
  manifest: {
    id: 'whatsapp',
    name: 'WhatsApp',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'whatsapp-btn',
      icon: '💬',
      label: 'WhatsApp',
      action: { type: 'panel', panelId: 'whatsapp-panel' },
      order: 9
    },
    panels: [{
      id: 'whatsapp-panel',
      title: 'WhatsApp',
      size: 'md'
    }]
  },
  PanelComponent: WhatsappPanel
};

export default whatsappModule;

export { default as WhatsappPanel } from './WhatsappPanel.svelte';
