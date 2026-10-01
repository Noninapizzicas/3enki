<script lang="ts">
  /**
   * MotorAvisosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'motor-avisos' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './motor-avisos.blueprint.json';

  export let panelId = '';
</script>

<div data-motor-avisos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🔔 Motor de avisos — generado del blueprint" />
</div>
