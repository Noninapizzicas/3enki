<script lang="ts">
  /**
   * AvisoCuadrePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'aviso-cuadre' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './aviso-cuadre.blueprint.json';

  export let panelId = '';
</script>

<div data-aviso-cuadre-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="⚖️ Aviso de cuadre — generado del blueprint" />
</div>
