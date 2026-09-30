<script lang="ts">
  /**
   * ReciboNominaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'recibo-nomina' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './recibo-nomina.blueprint.json';

  export let panelId = '';
</script>

<div data-recibo-nomina-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="recibo-nomina" titulo="👤 Recibo de nómina — generado del blueprint" />
</div>
