<script lang="ts">
  // Wrapper de PANEL para el sistema: UIModule.PanelComponent exige un
  // componente con SOLO { panelId: string }. AgenteProgreso tiene props
  // propias (requestId) para la ruta — el wrapper adapta el contrato del
  // panel y delega en la ejecución activa del store (sin requestId → la
  // que esté progresando).
  import AgenteProgreso from './AgenteProgreso.svelte';

  export let panelId: string;
</script>

<div data-agente-panel={panelId}>
  <AgenteProgreso />
</div>
