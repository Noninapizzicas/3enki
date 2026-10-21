<script lang="ts">
  /**
   * AvisoRevisionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'aviso-revision' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './aviso-revision.blueprint.json';

  export let panelId = '';
</script>

<div data-aviso-revision-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🚩 Aviso de revisión — generado del blueprint" />
</div>
