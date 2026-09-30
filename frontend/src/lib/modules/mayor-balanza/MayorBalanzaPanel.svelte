<script lang="ts">
  /**
   * MayorBalanzaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'mayor-balanza' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './mayor-balanza.blueprint.json';

  export let panelId = '';
</script>

<div data-mayor-balanza-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="mayor-balanza" titulo="📒 Mayor y balanza — generado del blueprint" />
</div>
