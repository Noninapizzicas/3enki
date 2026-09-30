<script lang="ts">
  /**
   * CruceFacturaRecepcionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cruce-factura-recepcion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cruce-factura-recepcion.blueprint.json';

  export let panelId = '';
</script>

<div data-cruce-factura-recepcion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cruce-factura-recepcion" titulo="🏭 Cruce factura-recepción — generado del blueprint" />
</div>
