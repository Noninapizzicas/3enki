<script lang="ts">
  /**
   * OnboardingNegocioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'onboarding-negocio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './onboarding-negocio.blueprint.json';

  export let panelId = '';
</script>

<div data-onboarding-negocio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="onboarding-negocio" titulo="🗂️ Alta de negocio — generado del blueprint" />
</div>
