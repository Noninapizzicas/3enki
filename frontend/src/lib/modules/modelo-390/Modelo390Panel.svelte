<script lang="ts">
  /**
   * Modelo390Panel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'modelo-390' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './modelo-390.blueprint.json';

  export let panelId = '';
</script>

<div data-modelo-390-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="modelo-390" titulo="🧾 Modelo 390 — generado del blueprint" />
</div>
