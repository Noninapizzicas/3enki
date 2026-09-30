<script lang="ts">
  /**
   * AperturaEjercicioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'apertura-ejercicio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './apertura-ejercicio.blueprint.json';

  export let panelId = '';
</script>

<div data-apertura-ejercicio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="apertura-ejercicio" titulo="📒 Apertura del ejercicio — generado del blueprint" />
</div>
