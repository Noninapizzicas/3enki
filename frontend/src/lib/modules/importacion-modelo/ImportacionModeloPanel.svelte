<script lang="ts">
  /**
   * ImportacionModeloPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'importacion-modelo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './importacion-modelo.blueprint.json';

  export let panelId = '';
</script>

<div data-importacion-modelo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="importacion-modelo" titulo="📥 Importar Modelo — generado del blueprint" />
</div>
