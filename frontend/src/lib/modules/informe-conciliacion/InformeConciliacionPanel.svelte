<script lang="ts">
  /**
   * InformeConciliacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'informe-conciliacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './informe-conciliacion.blueprint.json';

  export let panelId = '';
</script>

<div data-informe-conciliacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="informe-conciliacion" titulo="🏦 Informe de conciliación — generado del blueprint" />
</div>
