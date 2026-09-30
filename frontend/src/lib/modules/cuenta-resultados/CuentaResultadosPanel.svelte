<script lang="ts">
  /**
   * CuentaResultadosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'cuenta-resultados' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cuenta-resultados.blueprint.json';

  export let panelId = '';
</script>

<div data-cuenta-resultados-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cuenta-resultados" titulo="📒 Cuenta de resultados — generado del blueprint" />
</div>
