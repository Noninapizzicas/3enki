<script lang="ts">
  /**
   * EnvasePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'envase-embalaje' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './envase-embalaje.blueprint.json';

  export let panelId = '';
</script>

<div data-envase-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="envase" titulo="📦 Envase — generado del blueprint" />
</div>
