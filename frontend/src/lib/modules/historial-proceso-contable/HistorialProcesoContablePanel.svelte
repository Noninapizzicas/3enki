<script lang="ts">
  /**
   * HistorialProcesoContablePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'historial-proceso-contable' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './historial-proceso-contable.blueprint.json';

  export let panelId = '';
</script>

<div data-historial-proceso-contable-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🗂️ Historial del proceso contable — generado del blueprint" />
</div>
