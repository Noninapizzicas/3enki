<script lang="ts">
  /**
   * CuentaProveedorPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cuenta-proveedor' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cuenta-proveedor.blueprint.json';

  export let panelId = '';
</script>

<div data-cuenta-proveedor-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cuenta-proveedor" titulo="🏭 Cuenta de proveedor — generado del blueprint" />
</div>
