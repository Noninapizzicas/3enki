<script lang="ts">
  /**
   * La VENTANA DEL AGENTE — sin request_id (URL: /[project_id]/agentes/).
   *
   * Muestra la ejecución ACTIVA del store (la última que se abrió/está
   * corriendo). Útil para: abrir la ventana antes de lanzar el agente, o
   * cuando el request_id no se conoce de antemano. Si hay una ejecución
   * activa con pasos, los muestra; si no, espera en estado vacío.
   * Con request_id conocido, usa /[project_id]/agentes/[request_id].
   */
  import { page } from '$app/stores';
  import AgenteProgreso from '$lib/modules/agente-progreso/AgenteProgreso.svelte';

  $: projectId = $page.params.project_id;
</script>

<div class="agente-page">
  <div class="agente-topbar">
    <a href="/{$page.params.project_id}/chat" class="agente-volver">← volver al chat</a>
    <span class="agente-proyecto">Proyecto: {projectId}</span>
  </div>
  <!-- Sin requestId → el componente usa la ejecución activa del store -->
  <AgenteProgreso />
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
