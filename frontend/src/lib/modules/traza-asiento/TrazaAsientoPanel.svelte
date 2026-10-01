<script lang="ts">
  /**
   * TrazaAsientoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'traza-asiento' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './traza-asiento.blueprint.json';

  export let panelId = '';
</script>

<div data-traza-asiento-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🧾 Traza de asiento — generado del blueprint" />
</div>
