<script lang="ts">
  /**
   * LotesPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'lotes' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './lotes.blueprint.json';

  export let panelId = '';
</script>

<div data-lotes-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="lotes" titulo="🧊 Lotes — generado del blueprint" />
</div>
