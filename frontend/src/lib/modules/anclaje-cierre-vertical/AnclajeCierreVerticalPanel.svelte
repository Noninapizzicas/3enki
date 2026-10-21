<script lang="ts">
  /**
   * AnclajeCierreVerticalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'anclaje-cierre-vertical' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './anclaje-cierre-vertical.blueprint.json';

  export let panelId = '';
</script>

<div data-anclaje-cierre-vertical-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="⚓ Anclaje de cierre por vertical — generado del blueprint" />
</div>
