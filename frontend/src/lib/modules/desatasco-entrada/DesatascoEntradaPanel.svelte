<script lang="ts">
  /**
   * DesatascoEntradaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'desatasco-entrada' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './desatasco-entrada.blueprint.json';

  export let panelId = '';
</script>

<div data-desatasco-entrada-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="desatasco-entrada" titulo="🗂️ Desatasco de entrada — generado del blueprint" />
</div>
