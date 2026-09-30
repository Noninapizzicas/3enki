<script lang="ts">
  /**
   * ClaveNaturalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'clave-natural' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './clave-natural.blueprint.json';

  export let panelId = '';
</script>

<div data-clave-natural-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="clave-natural" titulo="⚙️ Clave natural — generado del blueprint" />
</div>
