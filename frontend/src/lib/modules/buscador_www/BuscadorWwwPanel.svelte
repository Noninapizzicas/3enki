<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './buscador_www.blueprint.json';

  export let panelId = '';
</script>

<div data-buscador_www-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="buscador_www" titulo="📦 BuscadorWww — generado del blueprint" />
</div>
