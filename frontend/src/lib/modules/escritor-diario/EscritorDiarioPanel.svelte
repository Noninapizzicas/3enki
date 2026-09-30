<script lang="ts">
  /**
   * EscritorDiarioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'escritor-diario' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './escritor-diario.blueprint.json';

  export let panelId = '';
</script>

<div data-escritor-diario-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="escritor-diario" titulo="📒 Escritor del diario — generado del blueprint" />
</div>
