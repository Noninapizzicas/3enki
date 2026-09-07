<script lang="ts">
  /**
   * CatalogoModelosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'catalogo-modelos' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './catalogo-modelos.blueprint.json';

  export let panelId = '';
</script>

<div data-catalogo-modelos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="catalogo-modelos" titulo="🗂️ Catálogo Modelos — generado del blueprint" />
</div>
