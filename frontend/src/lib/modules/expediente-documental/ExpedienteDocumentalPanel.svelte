<script lang="ts">
  /**
   * ExpedienteDocumentalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'expediente-documental' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './expediente-documental.blueprint.json';

  export let panelId = '';
</script>

<div data-expediente-documental-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="expediente-documental" titulo="🗂️ Expediente documental — generado del blueprint" />
</div>
