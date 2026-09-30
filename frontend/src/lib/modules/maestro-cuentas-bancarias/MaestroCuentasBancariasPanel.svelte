<script lang="ts">
  /**
   * MaestroCuentasBancariasPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'maestro-cuentas-bancarias' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './maestro-cuentas-bancarias.blueprint.json';

  export let panelId = '';
</script>

<div data-maestro-cuentas-bancarias-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="maestro-cuentas-bancarias" titulo="🏦 Cuentas bancarias — generado del blueprint" />
</div>
