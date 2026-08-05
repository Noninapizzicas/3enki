<script lang="ts">
  /**
   * La VENTANA DEL AGENTE — ruta fuera (pestaña aparte).
   *
   * URL: /[project_id]/agentes/[request_id]
   *
   * Muestra la ruta del agente en vivo (pasos, tools, resultado) alimentada
   * por push MQTT (store agente-progreso). Ábrela cuando lanzas un agente y
   * sigue con lo tuyo: la ventana se actualiza sola y avisa al terminar.
   * El mismo componente sirve como panel embebible dentro del chat.
   */
  import { page } from '$app/stores';
  import AgenteProgreso from '$lib/modules/agente-progreso/AgenteProgreso.svelte';

  $: requestId = $page.params.request_id;
  $: projectId = $page.params.project_id;
</script>

<div class="agente-page">
  <div class="agente-topbar">
    <a href="/{$page.params.project_id}/chat" class="agente-volver">← volver al chat</a>
    <span class="agente-proyecto">Proyecto: {projectId}</span>
  </div>
  <AgenteProgreso requestId={requestId} />
</div>

<style>
  .agente-page { min-height: 100vh; background: #fafafa; }
  .agente-topbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.6rem 1.2rem; border-bottom: 1px solid #e5e5e5; background: #fff;
    font-size: 0.85rem;
  }
  .agente-volver { color: #1a5fb4; text-decoration: none; }
  .agente-volver:hover { text-decoration: underline; }
  .agente-proyecto { color: #888; }
</style>
