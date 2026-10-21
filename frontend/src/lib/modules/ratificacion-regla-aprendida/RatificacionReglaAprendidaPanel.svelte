<script lang="ts">
  /**
   * RatificacionReglaAprendidaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'ratificacion-regla-aprendida' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './ratificacion-regla-aprendida.blueprint.json';

  export let panelId = '';
</script>

<div data-ratificacion-regla-aprendida-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="⚖️ Ratificación de regla aprendida — generado del blueprint" />
</div>
