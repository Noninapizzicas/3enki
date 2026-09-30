<script lang="ts">
  /**
   * CompletitudCoberturaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'completitud-cobertura' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './completitud-cobertura.blueprint.json';

  export let panelId = '';
</script>

<div data-completitud-cobertura-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="completitud-cobertura" titulo="⚙️ Completitud y cobertura — generado del blueprint" />
</div>
