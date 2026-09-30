<script lang="ts">
  /**
   * ConsultaCuentasBajoDemandaPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'consulta-cuentas-bajo-demanda' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './consulta-cuentas-bajo-demanda.blueprint.json';

  export let panelId = '';
</script>

<div data-consulta-cuentas-bajo-demanda-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="consulta-cuentas-bajo-demanda" titulo="📋 Consulta de cuentas — generado del blueprint" />
</div>
