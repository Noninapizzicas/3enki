<script lang="ts">
  /**
   * PuertoPlanContablePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'puerto-plan-contable' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puerto-plan-contable.blueprint.json';

  export let panelId = '';
</script>

<div data-puerto-plan-contable-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="puerto-plan-contable" titulo="📋 Puerto de plan contable — generado del blueprint" />
</div>
