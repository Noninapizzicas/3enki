<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './puente_creality.blueprint.json';

  export let panelId = '';
</script>

<div data-puente_creality-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="puente_creality" titulo="📦 PuenteCreality — generado del blueprint" />
</div>
