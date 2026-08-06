<script lang="ts">
  // ────────────────────────────────────────────────────────────────────────────
  // AgenteProgreso.svelte — la VENTANA DEL AGENTE (reutilizable: ruta fuera
  // /[project_id]/agentes/[request_id] o panel embebible dentro del chat).
  //
  // Muestra la RUTA del agente en vivo: estado, pasos, tools invocadas y
  // resultado. Se alimenta del store agente-progreso (push MQTT). El usuario
  // sigue su camino mientras el agente trabaja; esto se actualiza solo.
  // ────────────────────────────────────────────────────────────────────────────
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { ejecuciones, initAgenteProgreso, getEjecucion, abrirEjecucion, ejecucionActivaId, rehidratarDesdeBitacora } from '$lib/stores/agente-progreso';
  import type { AgenteEjecucion } from '$lib/stores/agente-progreso';

  // requestId opcional: la RUTA lo pasa explícito; el PANEL (openPanel('agente'))
  // no tiene props → usa la ejecución activa del store.
  export let requestId: string | undefined = undefined;

  let ejecucion: AgenteEjecucion | undefined = undefined;
  let unsubStore: (() => void) | undefined;
  let unsubInit: (() => void) | undefined;

  const ICONOS: Record<string, string> = {
    started: '🚀', thinking: '🧠', tool_call: '🔧', finalizing: '🏁'
  };

  function refrescar() {
    const rid = requestId || $ejecucionActivaId;
    ejecucion = rid ? getEjecucion(rid) : undefined;
  }

  onMount(() => {
    unsubInit = initAgenteProgreso();
    if (requestId) abrirEjecucion(requestId);
    refrescar();
    // CIMIENTO v3 — REHIDRATACIÓN: si la ventana se abrió con un request_id y la
    // ejecución no está en el store (página recargada / sesión nueva), recupera
    // el marco completo desde su BITÁCORA persistida (pasos + veredicto).
    if (requestId && !getEjecucion(requestId)) {
      const pid = $page.params?.project_id;
      if (pid) rehidratarDesdeBitacora(pid, requestId).then(() => refrescar());
    }
    // reaccionar a cambios del store (nuevos pasos) y de la ejecución activa
    unsubStore = ejecuciones.subscribe(() => refrescar());
  });

  onDestroy(() => {
    unsubStore?.();
    unsubInit?.();
  });
</script>

<div class="agente-ventana">
  {#if !ejecucion}
    <div class="agente-vacio">
      <div class="agente-spinner"></div>
      <p>Esperando al agente… la ventana se llenará sola cuando empiece a trabajar.</p>
    </div>
  {:else}
    <!-- Cabecera: estado -->
    <header class="agente-cabecera">
      <div class="agente-titulo">
        <span class="agente-emoji">🗺️</span>
        <div>
          <h3>{ejecucion.agent_name}</h3>
          {#if ejecucion.task}<p class="agente-tarea">{ejecucion.task.slice(0, 120)}</p>{/if}
        </div>
      </div>
      <span class="agente-estado agente-{ejecucion.status}">
        {#if ejecucion.status === 'running'}⏳ trabajando
        {:else if ejecucion.status === 'done'}✅ terminado
        {:else}❌ falló{/if}
      </span>
    </header>

    <!-- Métricas -->
    <div class="agente-metricas">
      <span>🔧 {ejecucion.tools_llamadas.length} tools</span>
      <span>📍 {ejecucion.pasos.length} pasos</span>
      {#if ejecucion.duration_ms}<span>⏱️ {(ejecucion.duration_ms / 1000).toFixed(0)}s</span>{/if}
    </div>

    <!-- La RUTA: pasos en vivo -->
    <ol class="agente-ruta">
      {#each ejecucion.pasos as paso, i (i)}
        <li class="agente-paso">
          <span class="agente-paso-icono">{ICONOS[paso.step] || '•'}</span>
          <div class="agente-paso-cuerpo">
            <p class="agente-paso-msg">
              {paso.message || (paso.tool_invoked ? `Llamando a ${paso.tool_invoked}` : paso.step)}
            </p>
            {#if paso.tool_invoked}
              <code class="agente-paso-tool">{paso.tool_invoked}</code>
            {/if}
          </div>
        </li>
      {/each}
    </ol>

    <!-- Error -->
    {#if ejecucion.status === 'failed' && ejecucion.error}
      <div class="agente-error">
        <strong>{ejecucion.error.code}</strong>: {ejecucion.error.message}
      </div>
    {/if}

    <!-- Resultado (resumen al terminar) -->
    {#if ejecucion.status === 'done' && ejecucion.resultado}
      <details class="agente-resultado">
        <summary>Ver resultado del agente</summary>
        <pre>{ejecucion.resultado}</pre>
      </details>
    {/if}
  {/if}
</div>

<style>
  .agente-ventana { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 1rem; }
  .agente-vacio { text-align: center; color: #666; padding: 3rem 1rem; }
  .agente-spinner {
    width: 28px; height: 28px; margin: 0 auto 0.75rem;
    border: 3px solid #ddd; border-top-color: #4a90d9; border-radius: 50%;
    animation: girar 1s linear infinite;
  }
  @keyframes girar { to { transform: rotate(360deg); } }
  .agente-cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.75rem; }
  .agente-titulo { display: flex; gap: 0.6rem; align-items: flex-start; }
  .agente-emoji { font-size: 1.6rem; }
  .agente-titulo h3 { margin: 0; font-size: 1.05rem; }
  .agente-tarea { margin: 0.15rem 0 0; color: #666; font-size: 0.85rem; }
  .agente-estado { font-size: 0.8rem; font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 999px; white-space: nowrap; }
  .agente-running { background: #e8f2ff; color: #1a5fb4; }
  .agente-done { background: #e6f4ea; color: #1e7e34; }
  .agente-failed { background: #fde8e8; color: #b42318; }
  .agente-metricas { display: flex; gap: 1rem; padding: 0.6rem 0; color: #555; font-size: 0.85rem; }
  .agente-ruta { list-style: none; margin: 0; padding: 0; max-height: 45vh; overflow-y: auto; }
  .agente-paso { display: flex; gap: 0.6rem; padding: 0.45rem 0; border-bottom: 1px dashed #f0f0f0; }
  .agente-paso-icono { font-size: 1.05rem; }
  .agente-paso-cuerpo { flex: 1; min-width: 0; }
  .agente-paso-msg { margin: 0; font-size: 0.9rem; }
  .agente-paso-tool { font-size: 0.75rem; background: #f4f4f4; padding: 0.1rem 0.4rem; border-radius: 4px; color: #333; }
  .agente-error { margin-top: 0.75rem; background: #fde8e8; color: #b42318; padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.85rem; }
  .agente-resultado { margin-top: 0.75rem; }
  .agente-resultado summary { cursor: pointer; color: #1a5fb4; font-size: 0.85rem; }
  .agente-resultado pre { white-space: pre-wrap; background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 0.6rem; font-size: 0.8rem; max-height: 30vh; overflow-y: auto; }
</style>
