<script lang="ts">
  /**
   * LineasNominaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'lineas-nomina' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './lineas-nomina.blueprint.json';

  export let panelId = '';
</script>

<div data-lineas-nomina-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="lineas-nomina" titulo="👤 Líneas de nómina — generado del blueprint" />
</div>
