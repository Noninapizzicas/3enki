<script lang="ts">
  /**
   * AgenteMarco.svelte — el DESPLEGABLE del agente dentro del chat.
   *
   * Aparece automáticamente cuando hay un agente trabajando (o terminó hace
   * poco) y se actualiza solo con la información que devuelve (push MQTT
   * vía store agente-progreso). Colapsable: no molesta, pero está ahí.
   *
   * No recibe props — usa la ejecución ACTIVA del store (la última abierta).
   */
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { ejecuciones, initAgenteProgreso, getEjecucion, ejecucionActivaId, abrirEjecucion } from '$lib/stores/agente-progreso';
  import type { AgenteEjecucion, AgentePaso } from '$lib/stores/agente-progreso';

  let ejecucion: AgenteEjecucion | undefined = undefined;
  let abierto = true;          // desplegado por defecto cuando hay agente
  let unsubStore: (() => void) | undefined;
  let unsubInit: (() => void) | undefined;

  $: activa = $ejecucionActivaId;
  $: ejecucion = activa ? getEjecucion(activa) : undefined;

  // Si la ejecución termina (done/failed), mantener el marco visible pero
  // colapsar el detalle — la cabecera con el estado queda.
  $: terminada = !!ejecucion && ejecucion.status !== 'running';

  function toggle() { abierto = !abierto; }

  function iconoPaso(p: AgentePaso): string {
    if (p.step === 'started') return '🚀';
    if (p.step === 'tool_call') return '🔧';
    if (p.step === 'finalizing') return '🏁';
    return '🧠';
  }

  function ultimosPasos(n: number): AgentePaso[] {
    if (!ejecucion) return [];
    return ejecucion.pasos.slice(-n).reverse();
  }

  onMount(() => {
    unsubInit = initAgenteProgreso();
    // reaccionar a cambios del store (nuevos pasos, cierre)
    unsubStore = ejecuciones.subscribe(() => {
      const rid = get(ejecucionActivaId) as string | null;
      ejecucion = rid ? getEjecucion(rid) : undefined;
    });
    // Si no hay activa, esperar a que llegue la primera (agent_progress la crea)
    if (!get(ejecucionActivaId)) abrirEjecucion(''); // no-op; la suscripción lo cubre
  });

  onDestroy(() => {
    unsubStore?.();
    unsubInit?.();
  });
</script>

{#if ejecucion && (ejecucion.status === 'running' || ejecucion.pasos.length > 0)}
  <div class="agente-marco" class:terminada>
    <button class="agente-cabecera" on:click={toggle} aria-expanded={abierto}>
      <span class="agente-estado">
        {#if ejecucion.status === 'running'}
          <span class="spinner">⏳</span>
        {:else if ejecucion.status === 'failed'}
          <span>❌</span>
        {:else}
          <span>✅</span>
        {/if}
      </span>
      <span class="agente-titulo">
        {#if ejecucion.status === 'running'}
          <strong>{ejecucion.agent_name}</strong> trabajando…
        {:else if ejecucion.status === 'failed'}
          <strong>{ejecucion.agent_name}</strong> falló
        {:else}
          <strong>{ejecucion.agent_name}</strong> terminó
        {/if}
      </span>
      <span class="agente-metrica">
        {ejecucion.tools_llamadas.length} tools · {ejecucion.pasos.length} pasos
        {#if ejecucion.duration_ms}
          · {Math.round(ejecucion.duration_ms / 1000)}s
        {/if}
      </span>
      <span class="agente-flecha">{abierto ? '▾' : '▸'}</span>
    </button>

    {#if abierto}
      <div class="agente-cuerpo">
        {#if ejecucion.task}
          <div class="agente-task">{ejecucion.task}</div>
        {/if}

        {#if ejecucion.status === 'failed' && ejecucion.error}
          <div class="agente-error">
            <strong>{ejecucion.error.code}</strong>: {ejecucion.error.message}
          </div>
        {/if}

        {#if ultimosPasos(8).length > 0}
          <div class="agente-pasos">
            {#each ultimosPasos(8) as paso (paso.ts)}
              <div class="agente-paso">
                <span class="paso-icono">{iconoPaso(paso)}</span>
                <span class="paso-texto">
                  {#if paso.tool_invoked}
                    <code>{paso.tool_invoked}</code>
                  {/if}
                  {paso.message || ''}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="agente-pasos"><div class="agente-paso"><span class="paso-texto">Esperando al agente…</span></div></div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .agente-marco {
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    background: #fff;
    margin-bottom: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .agente-marco.terminada { border-color: #cfe3cf; }

  .agente-cabecera {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    background: #f8fafc;
    border: none;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .agente-marco.terminada .agente-cabecera { background: #f2f9f2; }

  .agente-estado { font-size: 1rem; }
  .spinner { display: inline-block; animation: spin 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .agente-titulo { flex: 1; font-size: 0.9rem; color: #333; }
  .agente-metrica { font-size: 0.75rem; color: #888; white-space: nowrap; }
  .agente-flecha { color: #999; font-size: 0.8rem; }

  .agente-cuerpo { padding: 0.6rem 0.75rem; border-top: 1px solid #eee; }
  .agente-task { font-size: 0.8rem; color: #666; margin-bottom: 0.5rem; font-style: italic; }

  .agente-error {
    background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
    border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.8rem; margin-bottom: 0.5rem;
  }

  .agente-pasos { display: flex; flex-direction: column; gap: 0.25rem; }
  .agente-paso { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.8rem; }
  .paso-icono { flex-shrink: 0; }
  .paso-texto { color: #444; }
  .paso-texto code {
    background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px;
    padding: 0.05rem 0.35rem; font-size: 0.72rem; color: #0f766e;
  }
</style>
