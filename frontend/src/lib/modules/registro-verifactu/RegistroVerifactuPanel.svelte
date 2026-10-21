<script lang="ts">
  /**
   * RegistroVerifactuPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'registro-verifactu' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './registro-verifactu.blueprint.json';

  export let panelId = '';
</script>

<div data-registro-verifactu-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="🔗 Registro Verifactu — generado del blueprint" />
</div>
