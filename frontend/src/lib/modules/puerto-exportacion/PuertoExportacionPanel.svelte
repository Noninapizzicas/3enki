<script lang="ts">
  /**
   * PuertoExportacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'puerto-exportacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puerto-exportacion.blueprint.json';

  export let panelId = '';
</script>

<div data-puerto-exportacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="puerto-exportacion" titulo="📋 Puerto de exportación — generado del blueprint" />
</div>
