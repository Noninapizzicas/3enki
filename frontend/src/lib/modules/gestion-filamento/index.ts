/**
 * Módulo Gestion de Filamento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'gestion-filamento' alimentado por su blueprint (gestion-filamento.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import GestionFilamentoPanel from './GestionFilamentoPanel.svelte';

export const gestionFilamentoModule: UIModule = {
  manifest: {
    id: 'gestion-filamento',
    name: 'Filamento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'gestion-filamento-btn',
      icon: '🧵',
      label: 'Filamento',
      action: { type: 'panel', panelId: 'gestion-filamento-panel' },
      order: 24
    },
    panels: [{
      id: 'gestion-filamento-panel',
      title: 'Filamento',
      size: 'lg'
    }]
  },
  PanelComponent: GestionFilamentoPanel
};

export default gestionFilamentoModule;

export { default as GestionFilamentoPanel } from './GestionFilamentoPanel.svelte';
