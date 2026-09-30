<script lang="ts">
  /**
   * ControlCalidadMuestreoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'control-calidad-muestreo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './control-calidad-muestreo.blueprint.json';

  export let panelId = '';
</script>

<div data-control-calidad-muestreo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="control-calidad-muestreo" titulo="⚙️ Control de calidad — generado del blueprint" />
</div>
