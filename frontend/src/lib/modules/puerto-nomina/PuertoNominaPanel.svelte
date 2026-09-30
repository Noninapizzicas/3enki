<script lang="ts">
  /**
   * PuertoNominaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'puerto-nomina' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puerto-nomina.blueprint.json';

  export let panelId = '';
</script>

<div data-puerto-nomina-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="puerto-nomina" titulo="👤 Puerto de nómina — generado del blueprint" />
</div>
