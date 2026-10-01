<script lang="ts">
  /**
   * HechoRectificativoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'hecho-rectificativo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './hecho-rectificativo.blueprint.json';

  export let panelId = '';
</script>

<div data-hecho-rectificativo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🔁 Hecho rectificativo — generado del blueprint" />
</div>
