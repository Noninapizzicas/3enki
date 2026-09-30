<script lang="ts">
  /**
   * CuadreCobroPagoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cuadre-cobro-pago' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cuadre-cobro-pago.blueprint.json';

  export let panelId = '';
</script>

<div data-cuadre-cobro-pago-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cuadre-cobro-pago" titulo="🏦 Cuadre cobro-pago — generado del blueprint" />
</div>
