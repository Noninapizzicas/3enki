<script lang="ts">
  /**
   * ValorNetoContablePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'valor-neto-contable' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './valor-neto-contable.blueprint.json';

  export let panelId = '';
</script>

<div data-valor-neto-contable-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="valor-neto-contable" titulo="📊 Valor neto contable — generado del blueprint" />
</div>
