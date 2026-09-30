<script lang="ts">
  /**
   * EstimacionIsIrpfPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'estimacion-is-irpf' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './estimacion-is-irpf.blueprint.json';

  export let panelId = '';
</script>

<div data-estimacion-is-irpf-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="estimacion-is-irpf" titulo="🧾 Estimación IS/IRPF — generado del blueprint" />
</div>
