<script lang="ts">
  /**
   * PlanAmortizacionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'plan-amortizacion' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './plan-amortizacion.blueprint.json';

  export let panelId = '';
</script>

<div data-plan-amortizacion-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="plan-amortizacion" titulo="🏗️ Plan de amortización — generado del blueprint" />
</div>
