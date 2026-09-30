<script lang="ts">
  /**
   * ContratoHechoMinimoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'contrato-hecho-minimo' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './contrato-hecho-minimo.blueprint.json';

  export let panelId = '';
</script>

<div data-contrato-hecho-minimo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="contrato-hecho-minimo" titulo="⚙️ Contrato de hecho mínimo — generado del blueprint" />
</div>
