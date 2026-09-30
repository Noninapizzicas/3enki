<script lang="ts">
  /**
   * ActivacionVerticalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'activacion-vertical' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './activacion-vertical.blueprint.json';

  export let panelId = '';
</script>

<div data-activacion-vertical-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="activacion-vertical" titulo="🗂️ Activación de vertical — generado del blueprint" />
</div>
