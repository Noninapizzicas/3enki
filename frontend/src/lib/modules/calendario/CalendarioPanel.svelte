<script lang="ts">
  /**
   * CalendarioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'calendario' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './calendario.blueprint.json';

  export let panelId = '';
</script>

<div data-calendario-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="calendario" titulo="📅 Calendario — generado del blueprint" />
</div>
