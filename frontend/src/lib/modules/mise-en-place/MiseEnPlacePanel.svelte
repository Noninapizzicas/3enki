<script lang="ts">
  /**
   * MiseEnPlacePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'mise-en-place' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './mise-en-place.blueprint.json';

  export let panelId = '';
</script>

<div data-mise-en-place-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="mise-en-place" titulo="🥘 Mise en Place — generado del blueprint" />
</div>
