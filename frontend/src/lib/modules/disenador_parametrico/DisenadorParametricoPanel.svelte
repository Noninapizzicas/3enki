<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './disenador_parametrico.blueprint.json';

  export let panelId = '';
</script>

<div data-disenador_parametrico-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="disenador_parametrico" titulo="📦 DisenadorParametrico — generado del blueprint" />
</div>
