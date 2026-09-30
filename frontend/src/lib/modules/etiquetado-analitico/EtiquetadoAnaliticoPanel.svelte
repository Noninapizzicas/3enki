<script lang="ts">
  /**
   * EtiquetadoAnaliticoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'etiquetado-analitico' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './etiquetado-analitico.blueprint.json';

  export let panelId = '';
</script>

<div data-etiquetado-analitico-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="etiquetado-analitico" titulo="📊 Etiquetado analítico — generado del blueprint" />
</div>
