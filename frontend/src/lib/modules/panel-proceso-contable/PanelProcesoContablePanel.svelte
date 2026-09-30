<script lang="ts">
  /**
   * PanelProcesoContablePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'panel-proceso-contable' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './panel-proceso-contable.blueprint.json';

  export let panelId = '';
</script>

<div data-panel-proceso-contable-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="panel-proceso-contable" titulo="🗂️ Panel del proceso — generado del blueprint" />
</div>
