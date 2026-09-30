<script lang="ts">
  /**
   * BajaActivoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'baja-activo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './baja-activo.blueprint.json';

  export let panelId = '';
</script>

<div data-baja-activo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="baja-activo" titulo="🏗️ Baja de activo — generado del blueprint" />
</div>
