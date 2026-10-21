<script lang="ts">
  /**
   * TecnicasPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'tecnicas' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './tecnicas.blueprint.json';

  export let panelId = '';
</script>

<BlueprintForm {blueprint} moduleId="tecnicas" titulo="🍳 Técnicas — generado del blueprint" />
