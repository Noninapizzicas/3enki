<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    colaImpresionStore,
    pendientes,
    imprimiendo,
    propuesta,
    initColaImpresion,
    initColaImpresionSubscriptions,
    encadenar,
    proponerSiguiente,
    actualizarEstado
  } from '$lib/stores/cola-impresion';

  let encadenando = false;
  let ultimoCiclo: string | null = null;
  let cleanup: (() => void) | null = null;

  onMount(async () => {
    await initColaImpresion();
    cleanup = initColaImpresionSubscriptions();
  });

  onDestroy(() => {
    if (cleanup) cleanup();
  });

  async function onEncadenar() {
    encadenando = true;
    try {
      await encadenar();
      ultimoCiclo = new Date().toLocaleTimeString();
    } finally {
      encadenando = false;
    }
  }
</script>

<div class="panel-orquestador">
  <header class="cabecera">
    <h2>🔁 Orquestador de Impresión</h2>
    {#if $colaImpresionStore.loading}
      <span class="badge">cargando…</span>
    {/if}
  </header>

  {#if $colaImpresionStore.error}
    <div class="error">⚠ {$colaImpresionStore.error}</div>
  {/if}

  <!-- Estado del ciclo -->
  <section class="seccion">
    <h3>Estado del ciclo</h3>
    <div class="estado-ciclo">
      <div class="etapa">
        <span class="punto {$imprimiendo.length ? 'activo' : ''}"></span>
        <span>Imprimiendo</span>
        <strong>{$imprimiendo.length}</strong>
      </div>
      <div class="flecha">→</div>
      <div class="etapa">
        <span class="punto {$pendientes.length ? 'activo' : ''}"></span>
        <span>Pendientes</span>
        <strong>{$pendientes.length}</strong>
      </div>
      <div class="flecha">→</div>
      <div class="etapa">
        <span class="punto {$propuesta?.modelo ? 'activo' : ''}"></span>
        <span>Propuesta</span>
        <strong>{$propuesta?.modelo ? $propuesta.modelo.nombre : '—'}</strong>
      </div>
    </div>
  </section>

  <!-- Acción principal -->
  <section class="seccion">
    <h3>Encadenar ciclo</h3>
    <p class="desc">
      Propone el siguiente modelo, lo marca como imprimiendo y deja la cola lista para el siguiente.
    </p>
    <div class="fila">
      <button on:click={onEncadenar} disabled={encadenando || !$pendientes.length}>
        {encadenando ? 'Encadenando…' : '🔁 Encadenar ciclo'}
      </button>
      <button on:click={proponerSiguiente} disabled={!$pendientes.length}>Proponer siguiente</button>
    </div>
    {#if ultimoCiclo}
      <p class="meta">Último ciclo: {ultimoCiclo}</p>
    {/if}
  </section>

  <!-- Cola en marcha -->
  <section class="seccion">
    <h3>Cola en marcha</h3>
    {#if $colaImpresionStore.cola.length === 0}
      <p class="vacio">Sin modelos en cola.</p>
    {:else}
      <ul class="lista">
        {#each $colaImpresionStore.cola as m (m.id)}
          <li class="modelo {m.estado.toLowerCase()}">
            <span class="nombre">{m.nombre}</span>
            <span class="badge">{m.estado}</span>
            <span class="badge">p{m.prioridad}</span>
            {#if m.estado === 'PENDIENTE'}
              <button on:click={() => actualizarEstado(m.id, 'IMPRIMIENDO')}>▶</button>
            {:else if m.estado === 'IMPRIMIENDO'}
              <button on:click={() => actualizarEstado(m.id, 'IMPRESO')}>✓</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .panel-orquestador { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  .cabecera { display: flex; align-items: center; justify-content: space-between; }
  .cabecera h2 { margin: 0; font-size: 1.1rem; }
  .seccion { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.75rem; }
  .seccion h3 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--color-text-muted, #aaa); }
  .fila { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  button { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-accent, #2563eb); color: #fff; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { background: rgba(220,38,38,.15); border: 1px solid #dc2626; color: #fca5a5; padding: 0.5rem; border-radius: 6px; }
  .estado-ciclo { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .etapa { display: flex; align-items: center; gap: 0.4rem; background: var(--color-bg-item, #1a1a1a); padding: 0.4rem 0.6rem; border-radius: 6px; }
  .etapa strong { color: var(--color-accent, #2563eb); }
  .punto { width: 10px; height: 10px; border-radius: 50%; background: #444; }
  .punto.activo { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
  .flecha { color: var(--color-text-muted, #888); }
  .desc { color: var(--color-text-muted, #888); font-size: 0.85rem; margin: 0 0 0.5rem; }
  .meta { color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .badge { background: var(--color-badge, #333); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; }
  .vacio { color: var(--color-text-muted, #888); font-style: italic; }
  .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .modelo { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem; border-radius: 6px; background: var(--color-bg-item, #1a1a1a); }
  .modelo .nombre { flex: 1; }
  .modelo.pendiente { border-left: 3px solid #f59e0b; }
  .modelo.imprimiendo { border-left: 3px solid #2563eb; }
  .modelo.impreso { border-left: 3px solid #22c55e; opacity: 0.6; }
</style>
