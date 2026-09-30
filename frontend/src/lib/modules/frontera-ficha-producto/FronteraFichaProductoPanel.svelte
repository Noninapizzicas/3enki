<script lang="ts">
  /**
   * FronteraFichaProductoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'frontera-ficha-producto' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './frontera-ficha-producto.blueprint.json';

  export let panelId = '';
</script>

<div data-frontera-ficha-producto-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="frontera-ficha-producto" titulo="📦 Frontera de ficha — generado del blueprint" />
</div>
