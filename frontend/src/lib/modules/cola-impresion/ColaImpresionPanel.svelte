<script lang="ts">
  /**
   * ColaImpresionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cola-impresion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cola-impresion.blueprint.json';

  export let panelId = '';
</script>

<div data-cola-impresion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cola-impresion" titulo="🖨️ Cola Impresión — generado del blueprint" />
</div>
