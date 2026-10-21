<script lang="ts">
  /**
   * ContratoHechoMinimoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'contrato-hecho-minimo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './contrato-hecho-minimo.blueprint.json';

  export let panelId = '';
</script>

<div data-contrato-hecho-minimo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contabilidad" titulo="📋 Contrato de hecho mínimo — generado del blueprint" />
</div>
