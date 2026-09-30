<script lang="ts">
  /**
   * ConceptosExtraNominaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'conceptos-extra-nomina' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './conceptos-extra-nomina.blueprint.json';

  export let panelId = '';
</script>

<div data-conceptos-extra-nomina-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="conceptos-extra-nomina" titulo="👤 Conceptos extra — generado del blueprint" />
</div>
