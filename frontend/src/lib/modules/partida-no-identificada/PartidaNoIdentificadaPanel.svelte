<script lang="ts">
  /**
   * PartidaNoIdentificadaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'partida-no-identificada' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './partida-no-identificada.blueprint.json';

  export let panelId = '';
</script>

<div data-partida-no-identificada-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="partida-no-identificada" titulo="🔔 Partida no identificada — generado del blueprint" />
</div>
