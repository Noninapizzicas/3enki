<script lang="ts">
  /**
   * PrevisionCajaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'prevision-caja' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './prevision-caja.blueprint.json';

  export let panelId = '';
</script>

<div data-prevision-caja-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="prevision-caja" titulo="🏦 Previsión de caja — generado del blueprint" />
</div>
