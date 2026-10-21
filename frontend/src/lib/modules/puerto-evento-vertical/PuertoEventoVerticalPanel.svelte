<script lang="ts">
  /**
   * PuertoEventoVerticalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'puerto-evento-vertical' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puerto-evento-vertical.blueprint.json';

  export let panelId = '';
</script>

<div data-puerto-evento-vertical-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🛃 Puerto de evento de vertical — generado del blueprint" />
</div>
