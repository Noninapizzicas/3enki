<script lang="ts">
  /**
   * MaestroTercerosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'maestro-terceros' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './maestro-terceros.blueprint.json';

  export let panelId = '';
</script>

<div data-maestro-terceros-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="👥 Maestro de terceros — generado del blueprint" />
</div>
