<script lang="ts">
  /**
   * LiquidacionBajaEmpleadoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'liquidacion-baja-empleado' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './liquidacion-baja-empleado.blueprint.json';

  export let panelId = '';
</script>

<div data-liquidacion-baja-empleado-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="liquidacion-baja-empleado" titulo="👤 Liquidación de baja — generado del blueprint" />
</div>
