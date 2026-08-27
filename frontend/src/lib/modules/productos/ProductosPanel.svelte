<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './productos.blueprint.json';

  export let panelId = '';
</script>

<div data-productos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="productos" titulo="📦 Productos — generado del blueprint" />
</div>
