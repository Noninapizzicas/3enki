/**
 * Módulo Onboarding de negocio — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'onboarding-negocio' alimentado por su blueprint (onboarding-negocio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import OnboardingNegocioPanel from './OnboardingNegocioPanel.svelte';

export const onboardingNegocioModule: UIModule = {
  manifest: {
    id: 'onboarding-negocio',
    name: 'Onboarding de negocio',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'onboarding-negocio-btn',
      icon: '🏢',
      label: 'Onboarding',
      action: { type: 'panel', panelId: 'onboarding-negocio-panel' },
      order: 44
    },
    panels: [{
      id: 'onboarding-negocio-panel',
      title: 'Onboarding de negocio',
      size: 'lg'
    }]
  },
  PanelComponent: OnboardingNegocioPanel
};

export default onboardingNegocioModule;

export { default as OnboardingNegocioPanel } from './OnboardingNegocioPanel.svelte';
