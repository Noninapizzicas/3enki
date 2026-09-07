<script lang="ts">
  /**
   * HistorialImpresionesPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'historial-impresiones' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './historial-impresiones.blueprint.json';

  export let panelId = '';
</script>

<div data-historial-impresiones-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="historial-impresiones" titulo="📜 Historial — generado del blueprint" />
</div>
