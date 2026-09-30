<script lang="ts">
  /**
   * PartidaConciliatoriaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'partida-conciliatoria' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './partida-conciliatoria.blueprint.json';

  export let panelId = '';
</script>

<div data-partida-conciliatoria-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="partida-conciliatoria" titulo="🏦 Partidas conciliatorias — generado del blueprint" />
</div>
