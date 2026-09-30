<script lang="ts">
  /**
   * MarcaSociedadPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'marca-sociedad' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './marca-sociedad.blueprint.json';

  export let panelId = '';
</script>

<div data-marca-sociedad-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="marca-sociedad" titulo="📊 Marca de sociedad — generado del blueprint" />
</div>
