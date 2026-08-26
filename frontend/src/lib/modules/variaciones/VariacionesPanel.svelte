<script lang="ts">
  /**
   * VariacionesPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'variaciones' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './variaciones.blueprint.json';

  export let panelId = '';
</script>

<div data-variaciones-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="variaciones" titulo="🔧 Variaciones — generado del blueprint" />
</div>
