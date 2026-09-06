<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cupula_stl.blueprint.json';

  export let panelId = '';
</script>

<div data-cupula_stl-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cupula_stl" titulo="📦 CupulaStl — generado del blueprint" />
</div>
