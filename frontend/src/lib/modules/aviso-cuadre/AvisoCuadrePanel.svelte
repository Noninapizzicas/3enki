<script lang="ts">
  /**
   * AvisoCuadrePanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'aviso-cuadre' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './aviso-cuadre.blueprint.json';

  export let panelId = '';
</script>

<div data-aviso-cuadre-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="aviso-cuadre" titulo="🗂️ Aviso de cuadre — generado del blueprint" />
</div>
