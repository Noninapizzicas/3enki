<script lang="ts">
  /**
   * ProducirPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'producir' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './producir.blueprint.json';

  export let panelId = '';
</script>

<div data-producir-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="producir" titulo="🏭 Producir — generado del blueprint" />
</div>
