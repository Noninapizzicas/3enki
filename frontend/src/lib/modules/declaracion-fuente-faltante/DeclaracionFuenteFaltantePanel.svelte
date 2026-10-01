<script lang="ts">
  /**
   * DeclaracionFuenteFaltantePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'declaracion-fuente-faltante' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './declaracion-fuente-faltante.blueprint.json';

  export let panelId = '';
</script>

<div data-declaracion-fuente-faltante-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="❓ Declaración de fuente faltante — generado del blueprint" />
</div>
