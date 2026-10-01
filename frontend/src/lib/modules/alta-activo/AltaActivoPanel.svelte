<script lang="ts">
  /**
   * AltaActivoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'alta-activo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './alta-activo.blueprint.json';

  export let panelId = '';
</script>

<div data-alta-activo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🏗️ Alta de activo — generado del blueprint" />
</div>
