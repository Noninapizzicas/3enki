<script lang="ts">
  /**
   * InformeAccionablePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'informe-accionable' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './informe-accionable.blueprint.json';

  export let panelId = '';
</script>

<div data-informe-accionable-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="informe-accionable" titulo="📋 Informe accionable — generado del blueprint" />
</div>
