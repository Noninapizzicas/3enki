<script lang="ts">
  /**
   * CicloImpresionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'ciclo-impresion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './ciclo-impresion.blueprint.json';

  export let panelId = '';
</script>

<div data-ciclo-impresion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="ciclo-impresion" titulo="⚙️ Ciclo Impresión — generado del blueprint" />
</div>
