<script lang="ts">
  /**
   * EstadoPresentacionFiscalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'estado-presentacion-fiscal' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './estado-presentacion-fiscal.blueprint.json';

  export let panelId = '';
</script>

<div data-estado-presentacion-fiscal-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="estado-presentacion-fiscal" titulo="🧾 Estado de presentación — generado del blueprint" />
</div>
