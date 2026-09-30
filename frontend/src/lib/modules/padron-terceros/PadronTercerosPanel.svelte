<script lang="ts">
  /**
   * PadronTercerosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'padron-terceros' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './padron-terceros.blueprint.json';

  export let panelId = '';
</script>

<div data-padron-terceros-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="padron-terceros" titulo="📥 Padrón de terceros — generado del blueprint" />
</div>
