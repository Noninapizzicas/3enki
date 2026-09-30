<script lang="ts">
  /**
   * ConciliacionBancariaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'conciliacion-bancaria' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './conciliacion-bancaria.blueprint.json';

  export let panelId = '';
</script>

<div data-conciliacion-bancaria-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="conciliacion-bancaria" titulo="🏦 Conciliación bancaria — generado del blueprint" />
</div>
