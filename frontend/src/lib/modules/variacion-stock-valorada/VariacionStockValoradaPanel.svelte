<script lang="ts">
  /**
   * VariacionStockValoradaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'variacion-stock-valorada' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './variacion-stock-valorada.blueprint.json';

  export let panelId = '';
</script>

<div data-variacion-stock-valorada-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="variacion-stock-valorada" titulo="📊 Variación de stock — generado del blueprint" />
</div>
