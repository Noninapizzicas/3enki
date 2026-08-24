<script lang="ts">
  /**
   * EntregaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'entrega' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './entrega.blueprint.json';

  export let panelId = '';
</script>

<div data-entrega-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="entrega" titulo="🛵 Entrega — generado del blueprint" />
</div>
