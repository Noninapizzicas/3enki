<script lang="ts">
  /**
   * BusquedaRepositoriosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'busqueda-repositorios' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './busqueda-repositorios.blueprint.json';

  export let panelId = '';
</script>

<div data-busqueda-repositorios-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="busqueda-repositorios" titulo="🔍 Buscar Modelos — generado del blueprint" />
</div>
