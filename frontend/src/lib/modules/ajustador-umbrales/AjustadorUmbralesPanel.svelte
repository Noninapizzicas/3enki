<script lang="ts">
  /**
   * AjustadorUmbralesPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'ajustador-umbrales' (con su sección `ui`
   * declarada por F6½) y lo entrega al componente dinámico. Lo ÚNICO específico
   * por módulo: <BlueprintForm blueprint moduleId />.
   * moduleId = el DOMINIO MQTT real (ui_handlers del module.json), con guion.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './ajustador-umbrales.blueprint.json';

  export let panelId = '';
</script>

<div data-ajustador-umbrales-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="ajustador-umbrales" titulo="🎚️ Umbral de validación — generado del blueprint" />
</div>
