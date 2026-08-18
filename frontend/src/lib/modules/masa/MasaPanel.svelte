<script lang="ts">
  /**
   * MasaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'masa' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './masa.blueprint.json';

  export let panelId = '';
</script>

<div data-masa-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="masa" titulo="🍞 Masa — generado del blueprint" />
</div>
