<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './variaciones.blueprint.json';

  export let panelId = '';
</script>

<div data-variaciones-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="variaciones" titulo="📦 Variaciones — generado del blueprint" />
</div>
