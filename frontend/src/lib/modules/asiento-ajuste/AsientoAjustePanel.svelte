<script lang="ts">
  /**
   * AsientoAjustePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'asiento-ajuste' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './asiento-ajuste.blueprint.json';

  export let panelId = '';
</script>

<div data-asiento-ajuste-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🩹 Asiento de ajuste — generado del blueprint" />
</div>
