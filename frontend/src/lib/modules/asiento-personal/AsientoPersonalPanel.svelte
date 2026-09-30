<script lang="ts">
  /**
   * AsientoPersonalPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'asiento-personal' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './asiento-personal.blueprint.json';

  export let panelId = '';
</script>

<div data-asiento-personal-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="asiento-personal" titulo="👤 Asiento de personal — generado del blueprint" />
</div>
