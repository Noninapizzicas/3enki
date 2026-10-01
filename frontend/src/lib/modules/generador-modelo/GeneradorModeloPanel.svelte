<script lang="ts">
  /**
   * GeneradorModeloPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'generador-modelo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './generador-modelo.blueprint.json';

  export let panelId = '';
</script>

<div data-generador-modelo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📤 Generador de modelo — generado del blueprint" />
</div>
