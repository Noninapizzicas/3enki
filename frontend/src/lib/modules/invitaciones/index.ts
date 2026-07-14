/**
 * Módulo Invitaciones — la cadena de delegación de capacidades desde el panel.
 *
 * El admin del sistema emite invitaciones de proyecto (crear-proyecto | unirse-proyecto),
 * las lista y las revoca. Autodescubierto por el loader (manifest.json + index.ts).
 */

import type { UIModule } from '$lib/ui-core';
import InvitacionesPanel from './InvitacionesPanel.svelte';

export const invitacionesModule: UIModule = {
  manifest: {
    id: 'invitaciones',
    name: 'Invitaciones',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'invitaciones-btn',
      icon: '🎟️',
      label: 'Invitaciones',
      action: { type: 'panel', panelId: 'invitaciones-panel' },
      order: 3
    },
    panels: [{
      id: 'invitaciones-panel',
      title: 'Invitaciones',
      size: 'lg'
    }]
  },
  PanelComponent: InvitacionesPanel
};

export default invitacionesModule;

export { default as InvitacionesPanel } from './InvitacionesPanel.svelte';

export {
  invStore,
  invitaciones,
  invLoading,
  invError,
  ultimoCodigo,
  loadInvitaciones,
  emitirInvitacion,
  revocarInvitacion,
  clearInvError,
  initInvitacionesSubscriptions,
  type Invitacion,
  type AccionInvitacion,
  type EstadoInvitacion,
  type InvitacionesState
} from '$lib/stores/invitaciones';
