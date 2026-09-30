<script lang="ts">
  /**
   * ReglaMovimientoBancarioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'regla-movimiento-bancario' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './regla-movimiento-bancario.blueprint.json';

  export let panelId = '';
</script>

<div data-regla-movimiento-bancario-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="regla-movimiento-bancario" titulo="🏦 Reglas de movimiento — generado del blueprint" />
</div>
