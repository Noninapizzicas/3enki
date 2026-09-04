<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cola_modelos.blueprint.json';

  export let panelId = '';
</script>

<div data-cola_modelos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cola_modelos" titulo="📦 ColaModelos — generado del blueprint" />
</div>
