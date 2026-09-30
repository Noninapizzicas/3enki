<script lang="ts">
  /**
   * PagosACuentaEmpleadoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'pagos-a-cuenta-empleado' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './pagos-a-cuenta-empleado.blueprint.json';

  export let panelId = '';
</script>

<div data-pagos-a-cuenta-empleado-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="pagos-a-cuenta-empleado" titulo="👤 Pagos a cuenta — generado del blueprint" />
</div>
