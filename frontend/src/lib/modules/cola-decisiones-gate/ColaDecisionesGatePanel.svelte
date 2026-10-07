<script lang="ts">
  /**
   * ColaDecisionesGatePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cola-decisiones-gate' (con su sección `ui`
   * declarada por F6½) y lo entrega al componente dinámico. Lo ÚNICO específico
   * por módulo: <BlueprintForm blueprint moduleId />.
   * moduleId = el DOMINIO MQTT real (ui_handlers del module.json), con guion.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cola-decisiones-gate.blueprint.json';

  export let panelId = '';
</script>

<div data-cola-decisiones-gate-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cola-decisiones-gate" titulo="🛡️ Cola de decisiones — generado del blueprint" />
</div>
