<script lang="ts">
  /**
   * AvisoAlNegocioPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'aviso-al-negocio' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './aviso-al-negocio.blueprint.json';

  export let panelId = '';
</script>

<div data-aviso-al-negocio-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📣 Aviso al negocio — generado del blueprint" />
</div>
