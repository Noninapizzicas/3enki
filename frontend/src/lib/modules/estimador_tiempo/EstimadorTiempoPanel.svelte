<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './estimador_tiempo.blueprint.json';

  export let panelId = '';
</script>

<div data-estimador_tiempo-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="estimador_tiempo" titulo="📦 EstimadorTiempo — generado del blueprint" />
</div>
