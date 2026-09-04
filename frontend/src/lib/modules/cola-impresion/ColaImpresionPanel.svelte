<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    colaImpresionStore,
    pendientes,
    imprimiendo,
    propuesta,
    initColaImpresion,
    initColaImpresionSubscriptions,
    cargarCola,
    agregarModelo,
    actualizarEstado,
    proponerSiguiente,
    encadenar,
    buscarModelos,
    generarScad
  } from '$lib/stores/cola-impresion';

  let nombre = '';
  let prioridad = 5;
  let tiempoEstimado = 30;
  let query = '';
  let scadParams = 'ancho=80, alto=20, profundidad=10';

  let cleanup: (() => void) | null = null;

  onMount(async () => {
    await initColaImpresion();
    cleanup = initColaImpresionSubscriptions();
  });

  onDestroy(() => {
    if (cleanup) cleanup();
  });

  async function onAgregar() {
    if (!nombre.trim()) return;
    const ok = await agregarModelo({ nombre: nombre.trim(), prioridad, tiempo_estimado: tiempoEstimado });
    if (ok) { nombre = ''; prioridad = 5; tiempoEstimado = 30; }
  }

  async function onBuscar() {
    await buscarModelos(query);
  }

  async function onGenerarScad() {
    const params: Record<string, unknown> = {};
    scadParams.split(',').forEach(pair => {
      const [k, v] = pair.split('=').map(s => s.trim());
      if (k && v) params[k] = Number(v) || v;
    });
    await generarScad(params);
  }
</script>

<div class="panel-cola">
  <header class="cabecera">
    <h2>🖨️ Cola de Impresión 3D</h2>
    {#if $colaImpresionStore.loading}
      <span class="badge">cargando…</span>
    {/if}
  </header>

  {#if $colaImpresionStore.error}
    <div class="error">⚠ {$colaImpresionStore.error}</div>
  {/if}

  <!-- Agregar modelo -->
  <section class="seccion">
    <h3>Agregar modelo a la cola</h3>
    <div class="fila">
      <input type="text" placeholder="Nombre del modelo" bind:value={nombre} />
      <input type="number" min="1" max="10" bind:value={prioridad} title="Prioridad (1-10)" />
      <input type="number" min="1" bind:value={tiempoEstimado} title="Tiempo estimado (min)" />
      <button on:click={onAgregar} disabled={!nombre.trim()}>Agregar</button>
    </div>
  </section>

  <!-- Propuesta siguiente -->
  <section class="seccion">
    <h3>Siguiente a imprimir</h3>
    {#if $propuesta?.modelo}
      <div class="propuesta">
        <strong>{$propuesta.modelo.nombre}</strong>
        <span class="badge">prioridad {$propuesta.modelo.prioridad}</span>
        <span class="badge">~{$propuesta.modelo.tiempo_estimado} min</span>
        <button on:click={() => actualizarEstado($propuesta.modelo.id, 'IMPRIMIENDO')}>▶ Imprimir</button>
      </div>
    {:else}
      <p class="vacio">{$propuesta?.causa === 'cola_vacia' ? 'Cola vacía — no hay nada que imprimir.' : 'Sin propuesta.'}</p>
    {/if}
    <div class="fila">
      <button on:click={proponerSiguiente}>Proponer siguiente</button>
      <button on:click={encadenar}>Encadenar ciclo</button>
    </div>
  </section>

  <!-- Cola viva -->
  <section class="seccion">
    <h3>Cola viva ({$pendientes.length} pendientes · {$imprimiendo.length} imprimiendo)</h3>
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

  <!-- Buscar modelos en la web -->
  <section class="seccion">
    <h3>Buscar modelos en la web</h3>
    <div class="fila">
      <input type="text" placeholder="conector 90 grados…" bind:value={query} />
      <button on:click={onBuscar} disabled={!query.trim() || $colaImpresionStore.buscando}>
        {$colaImpresionStore.buscando ? 'Buscando…' : 'Buscar'}
      </button>
    </div>
    {#if $colaImpresionStore.busqueda}
      <p class="meta">{$colaImpresionStore.busqueda.total} resultados para «{$colaImpresionStore.busqueda.query}»</p>
      <ul class="lista">
        {#each $colaImpresionStore.busqueda.resultados as r (r.url)}
          <li class="modelo">
            <a href={r.url} target="_blank" rel="noopener">{r.titulo}</a>
            <span class="badge">{r.fuente}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Diseño paramétrico -->
  <section class="seccion">
    <h3>Diseño paramétrico (OpenSCAD)</h3>
    <div class="fila">
      <input type="text" bind:value={scadParams} title="clave=valor, separados por coma" />
      <button on:click={onGenerarScad}>Generar SCAD</button>
    </div>
    {#if $colaImpresionStore.scad}
      <pre class="scad">{$colaImpresionStore.scad}</pre>
    {/if}
  </section>
</div>

<style>
  .panel-cola { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  .cabecera { display: flex; align-items: center; justify-content: space-between; }
  .cabecera h2 { margin: 0; font-size: 1.1rem; }
  .seccion { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.75rem; }
  .seccion h3 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--color-text-muted, #aaa); }
  .fila { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .fila input { flex: 1; min-width: 120px; padding: 0.4rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-input, #1a1a1a); color: inherit; }
  .fila input[type="number"] { flex: 0 0 70px; min-width: 70px; }
  button { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-accent, #2563eb); color: #fff; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { background: rgba(220,38,38,.15); border: 1px solid #dc2626; color: #fca5a5; padding: 0.5rem; border-radius: 6px; }
  .propuesta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .badge { background: var(--color-badge, #333); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; }
  .vacio { color: var(--color-text-muted, #888); font-style: italic; }
  .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .modelo { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem; border-radius: 6px; background: var(--color-bg-item, #1a1a1a); }
  .modelo .nombre { flex: 1; }
  .modelo.pendiente { border-left: 3px solid #f59e0b; }
  .modelo.imprimiendo { border-left: 3px solid #2563eb; }
  .modelo.impreso { border-left: 3px solid #22c55e; opacity: 0.6; }
  .meta { color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .scad { background: #0d0d0d; border-radius: 6px; padding: 0.5rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; }
</style>
