<script lang="ts">
  /**
   * CambioDesdeUltimaRevisionPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cambio-desde-ultima-revision' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cambio-desde-ultima-revision.blueprint.json';

  export let panelId = '';
</script>

<div data-cambio-desde-ultima-revision-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cambio-desde-ultima-revision" titulo="🗂️ Cambios desde la última revisión — generado del blueprint" />
</div>
