<script lang="ts">
  /**
   * AcusePresentacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'acuse-presentacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './acuse-presentacion.blueprint.json';

  export let panelId = '';
</script>

<div data-acuse-presentacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📮 Acuse de presentación — generado del blueprint" />
</div>
