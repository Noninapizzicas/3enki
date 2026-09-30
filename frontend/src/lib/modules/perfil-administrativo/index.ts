/**
 * Módulo Perfil administrativo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'perfil-administrativo' alimentado por su blueprint (perfil-administrativo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PerfilAdministrativoPanel from './PerfilAdministrativoPanel.svelte';

export const perfilAdministrativoModule: UIModule = {
  manifest: {
    id: 'perfil-administrativo',
    name: 'Perfil administrativo',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'perfil-administrativo-btn',
      icon: '🧾',
      label: 'Perfil fiscal',
      action: { type: 'panel', panelId: 'perfil-administrativo-panel' },
      order: 66
    },
    panels: [{
      id: 'perfil-administrativo-panel',
      title: 'Perfil administrativo',
      size: 'lg'
    }]
  },
  PanelComponent: PerfilAdministrativoPanel
};

export default perfilAdministrativoModule;

export { default as PerfilAdministrativoPanel } from './PerfilAdministrativoPanel.svelte';
