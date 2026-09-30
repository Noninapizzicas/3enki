<script lang="ts">
  /**
   * FacturaRectificativaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'factura-rectificativa' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './factura-rectificativa.blueprint.json';

  export let panelId = '';
</script>

<div data-factura-rectificativa-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="factura-rectificativa" titulo="🏭 Factura rectificativa — generado del blueprint" />
</div>
