<script lang="ts">
  /**
   * MarcaClientePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'marca-cliente' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="marca" = el DOMINIO MQTT real (ui_handlers del module.json), no la carpeta.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './marca-cliente.blueprint.json';

  export let panelId = '';
</script>

<div data-marca-cliente-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="marca" titulo="🎯 Marca — generado del blueprint" />
</div>
