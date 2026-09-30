<script lang="ts">
  /**
   * ColaDeclaracionesCriterioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cola-declaraciones-criterio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cola-declaraciones-criterio.blueprint.json';

  export let panelId = '';
</script>

<div data-cola-declaraciones-criterio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cola-declaraciones-criterio" titulo="⚙️ Cola de decisiones — generado del blueprint" />
</div>
