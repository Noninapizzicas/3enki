<script lang="ts">
  /**
   * FronteraPlanosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'frontera-planos' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './frontera-planos.blueprint.json';

  export let panelId = '';
</script>

<div data-frontera-planos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="frontera-planos" titulo="⚙️ Frontera de planos — generado del blueprint" />
</div>
