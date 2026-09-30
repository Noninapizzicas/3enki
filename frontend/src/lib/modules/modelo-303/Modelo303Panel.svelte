<script lang="ts">
  /**
   * Modelo303Panel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'modelo-303' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './modelo-303.blueprint.json';

  export let panelId = '';
</script>

<div data-modelo-303-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="modelo-303" titulo="🧾 Modelo 303 — generado del blueprint" />
</div>
