<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './cupula_gcode.blueprint.json';

  export let panelId = '';
</script>

<div data-cupula_gcode-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="cupula_gcode" titulo="📦 CupulaGcode — generado del blueprint" />
</div>
