<script lang="ts">
  /**
   * ConsolidacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'consolidacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './consolidacion.blueprint.json';

  export let panelId = '';
</script>

<div data-consolidacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="consolidacion" titulo="📦 Consolidación del grupo — generado del blueprint" />
</div>
