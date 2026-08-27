<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './pedidos.blueprint.json';

  export let panelId = '';
</script>

<div data-pedidos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="pedidos" titulo="📦 Pedidos — generado del blueprint" />
</div>
