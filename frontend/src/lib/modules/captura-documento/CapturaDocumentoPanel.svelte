<script lang="ts">
  /**
   * CapturaDocumentoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'captura-documento' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './captura-documento.blueprint.json';

  export let panelId = '';
</script>

<div data-captura-documento-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="captura-documento" titulo="📥 Captura de documento — generado del blueprint" />
</div>
