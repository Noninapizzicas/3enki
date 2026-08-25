<script lang="ts">
  /**
   * PedidosPanel — envoltorio mínimo del generador schema→UI.
   * Importa el blueprint del módulo 'pedidos' (con su sección `ui` declarada por F6½)
   * y lo entrega al componente dinámico. Este fichero es lo ÚNICO específico por módulo:
   * <BlueprintForm blueprint moduleId />.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './pedidos.blueprint.json';

  export let panelId = '';
</script>

<div data-pedidos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="pedidos" titulo="📋 Pedidos — generado del blueprint" />
</div>
