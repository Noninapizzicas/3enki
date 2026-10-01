<script lang="ts">
  /**
   * RectificacionDeclaracionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'rectificacion-declaracion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './rectificacion-declaracion.blueprint.json';

  export let panelId = '';
</script>

<div data-rectificacion-declaracion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🧾 Rectificación de declaración — generado del blueprint" />
</div>
