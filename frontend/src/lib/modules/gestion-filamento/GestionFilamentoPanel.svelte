<script lang="ts">
  /**
   * GestionFilamentoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'gestion-filamento' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './gestion-filamento.blueprint.json';

  export let panelId = '';
</script>

<div data-gestion-filamento-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="gestion-filamento" titulo="🧵 Filamento — generado del blueprint" />
</div>
