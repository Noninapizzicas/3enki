<script lang="ts">
  /**
   * LiquidacionIvaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'liquidacion-iva' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './liquidacion-iva.blueprint.json';

  export let panelId = '';
</script>

<div data-liquidacion-iva-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="liquidacion-iva" titulo="🧾 Liquidación de IVA — generado del blueprint" />
</div>
