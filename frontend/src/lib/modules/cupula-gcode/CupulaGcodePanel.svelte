<script lang="ts">
  /**
   * CupulaGcodePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cupula-gcode' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cupula-gcode.blueprint.json';

  export let panelId = '';
</script>

<div data-cupula-gcode-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cupula-gcode" titulo="📦 Cúpula GCode — generado del blueprint" />
</div>
