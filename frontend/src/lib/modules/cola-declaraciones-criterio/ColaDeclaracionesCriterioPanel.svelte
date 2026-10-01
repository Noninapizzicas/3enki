<script lang="ts">
  /**
   * ColaDeclaracionesCriterioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cola-declaraciones-criterio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cola-declaraciones-criterio.blueprint.json';

  export let panelId = '';
</script>

<div data-cola-declaraciones-criterio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📋 Cola de criterios — generado del blueprint" />
</div>
