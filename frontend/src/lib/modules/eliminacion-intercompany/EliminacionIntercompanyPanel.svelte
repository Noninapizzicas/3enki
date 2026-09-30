<script lang="ts">
  /**
   * EliminacionIntercompanyPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'eliminacion-intercompany' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './eliminacion-intercompany.blueprint.json';

  export let panelId = '';
</script>

<div data-eliminacion-intercompany-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="eliminacion-intercompany" titulo="📊 Eliminación intercompany — generado del blueprint" />
</div>
