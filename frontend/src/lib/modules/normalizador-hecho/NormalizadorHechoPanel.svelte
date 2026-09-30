<script lang="ts">
  /**
   * NormalizadorHechoPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'normalizador-hecho' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './normalizador-hecho.blueprint.json';

  export let panelId = '';
</script>

<div data-normalizador-hecho-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="normalizador-hecho" titulo="📥 Normalizador de hechos — generado del blueprint" />
</div>
