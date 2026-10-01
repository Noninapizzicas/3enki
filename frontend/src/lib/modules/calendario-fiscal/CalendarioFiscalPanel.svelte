<script lang="ts">
  /**
   * CalendarioFiscalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'calendario-fiscal' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './calendario-fiscal.blueprint.json';

  export let panelId = '';
</script>

<div data-calendario-fiscal-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🗓️ Calendario fiscal — generado del blueprint" />
</div>
