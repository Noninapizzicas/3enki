<script lang="ts">
  /**
   * TasaCoberturaEntradaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'tasa-cobertura-entrada' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './tasa-cobertura-entrada.blueprint.json';

  export let panelId = '';
</script>

<div data-tasa-cobertura-entrada-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="tasa-cobertura-entrada" titulo="🗂️ Tasa de cobertura — generado del blueprint" />
</div>
