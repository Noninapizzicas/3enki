<script lang="ts">
  /**
   * PuertoDocumentoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'puerto-documento' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puerto-documento.blueprint.json';

  export let panelId = '';
</script>

<div data-puerto-documento-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="puerto-documento" titulo="📥 Frontera de documentos — generado del blueprint" />
</div>
