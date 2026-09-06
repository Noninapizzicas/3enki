<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './horarios_casa.blueprint.json';

  export let panelId = '';
</script>

<div data-horarios_casa-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="horarios_casa" titulo="📦 HorariosCasa — generado del blueprint" />
</div>
