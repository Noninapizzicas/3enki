<script lang="ts">
  /**
   * SelloCoberturaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'sello-cobertura' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './sello-cobertura.blueprint.json';

  export let panelId = '';
</script>

<div data-sello-cobertura-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="sello-cobertura" titulo="📊 Sello de cobertura — generado del blueprint" />
</div>
