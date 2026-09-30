<script lang="ts">
  /**
   * AjusteInventarioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'ajuste-inventario' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './ajuste-inventario.blueprint.json';

  export let panelId = '';
</script>

<div data-ajuste-inventario-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="ajuste-inventario" titulo="📊 Ajuste de inventario — generado del blueprint" />
</div>
