<script lang="ts">
  /**
   * AntiguedadDeSaldosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'antiguedad-de-saldos' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './antiguedad-de-saldos.blueprint.json';

  export let panelId = '';
</script>

<div data-antiguedad-de-saldos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="antiguedad-de-saldos" titulo="🏭 Antigüedad de saldos — generado del blueprint" />
</div>
