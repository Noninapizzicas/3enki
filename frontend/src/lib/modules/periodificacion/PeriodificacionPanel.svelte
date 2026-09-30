<script lang="ts">
  /**
   * PeriodificacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'periodificacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './periodificacion.blueprint.json';

  export let panelId = '';
</script>

<div data-periodificacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="periodificacion" titulo="📒 Periodificación — generado del blueprint" />
</div>
