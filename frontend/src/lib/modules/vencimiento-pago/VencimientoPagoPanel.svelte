<script lang="ts">
  /**
   * VencimientoPagoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'vencimiento-pago' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './vencimiento-pago.blueprint.json';

  export let panelId = '';
</script>

<div data-vencimiento-pago-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="vencimiento-pago" titulo="🏦 Vencimientos de pago — generado del blueprint" />
</div>
