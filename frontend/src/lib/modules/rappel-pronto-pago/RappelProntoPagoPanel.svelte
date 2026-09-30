<script lang="ts">
  /**
   * RappelProntoPagoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'rappel-pronto-pago' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './rappel-pronto-pago.blueprint.json';

  export let panelId = '';
</script>

<div data-rappel-pronto-pago-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="rappel-pronto-pago" titulo="🏭 Rappel por pronto pago — generado del blueprint" />
</div>
