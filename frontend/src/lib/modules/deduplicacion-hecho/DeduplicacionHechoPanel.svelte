<script lang="ts">
  /**
   * DeduplicacionHechoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'deduplicacion-hecho' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './deduplicacion-hecho.blueprint.json';

  export let panelId = '';
</script>

<div data-deduplicacion-hecho-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="deduplicacion-hecho" titulo="⚙️ Deduplicación de hechos — generado del blueprint" />
</div>
