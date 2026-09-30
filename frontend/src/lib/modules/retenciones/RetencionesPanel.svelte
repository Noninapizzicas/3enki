<script lang="ts">
  /**
   * RetencionesPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'retenciones' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './retenciones.blueprint.json';

  export let panelId = '';
</script>

<div data-retenciones-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="retenciones" titulo="🧾 Retenciones — generado del blueprint" />
</div>
