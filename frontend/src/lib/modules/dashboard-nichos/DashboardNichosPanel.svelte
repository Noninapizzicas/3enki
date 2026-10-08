<script lang="ts">
  /**
   * DashboardNichosPanel — observabilidad solo lectura del vertical nichos.
   * 5 RPCs de consulta (portafolio, salud, pipeline, decisiones, cronología),
   * refrescado por pulsos del bus. El dueño opera por Telegram; esto es mirar.
   * moduleId="nichos" = dominio MQTT real de las RPCs del vertical.
   */
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './dashboard-nichos.blueprint.json';

  export let panelId = '';
</script>

<div data-dashboard-nichos-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="nichos" titulo="Dashboard del vertical nichos" />
</div>
