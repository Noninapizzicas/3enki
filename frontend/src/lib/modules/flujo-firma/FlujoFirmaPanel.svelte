<script lang="ts">
  /**
   * FlujoFirmaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'flujo-firma' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './flujo-firma.blueprint.json';

  export let panelId = '';
</script>

<div data-flujo-firma-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="✍️ Flujo de firma — generado del blueprint" />
</div>
