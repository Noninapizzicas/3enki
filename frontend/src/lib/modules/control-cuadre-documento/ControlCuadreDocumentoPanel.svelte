<script lang="ts">
  /**
   * ControlCuadreDocumentoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'control-cuadre-documento' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './control-cuadre-documento.blueprint.json';

  export let panelId = '';
</script>

<div data-control-cuadre-documento-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="control-cuadre-documento" titulo="📥 Cuadre del documento — generado del blueprint" />
</div>
