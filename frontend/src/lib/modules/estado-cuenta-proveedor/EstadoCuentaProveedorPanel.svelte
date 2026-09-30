<script lang="ts">
  /**
   * EstadoCuentaProveedorPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'estado-cuenta-proveedor' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './estado-cuenta-proveedor.blueprint.json';

  export let panelId = '';
</script>

<div data-estado-cuenta-proveedor-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="estado-cuenta-proveedor" titulo="🏭 Estado de cuenta — generado del blueprint" />
</div>
