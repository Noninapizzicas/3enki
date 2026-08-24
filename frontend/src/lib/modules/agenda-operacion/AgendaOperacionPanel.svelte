<script lang="ts">
  /**
   * AgendaOperacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'agenda-operacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="agenda" = el DOMINIO MQTT real (ui_handlers del module.json), no la carpeta.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './agenda-operacion.blueprint.json';

  export let panelId = '';
</script>

<div data-agenda-operacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="agenda" titulo="📅 Agenda — generado del blueprint" />
</div>
