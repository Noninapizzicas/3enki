<script lang="ts">
  /**
   * ValoracionExistenciaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'valoracion-existencia' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './valoracion-existencia.blueprint.json';

  export let panelId = '';
</script>

<div data-valoracion-existencia-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="valoracion-existencia" titulo="📦 Valoración de existencias — generado del blueprint" />
</div>
