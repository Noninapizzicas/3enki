<script lang="ts">
  /**
   * EmisionFacturaVentaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'emision-factura-venta' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './emision-factura-venta.blueprint.json';

  export let panelId = '';
</script>

<div data-emision-factura-venta-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="emision-factura-venta" titulo="📥 Emisión de factura de venta — generado del blueprint" />
</div>
