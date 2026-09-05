<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    colaImpresionStore,
    initColaImpresion,
    initColaImpresionSubscriptions,
    generarScad
  } from '$lib/stores/cola-impresion';

  // Parámetros por defecto para el set ShelfFUXX (conectores 16mm)
  let paramsTexto = 'diametro=16, pared=1.2, relleno=20, tipo=conector_90';
  let generando = false;
  let cleanup: (() => void) | null = null;

  onMount(async () => {
    await initColaImpresion();
    cleanup = initColaImpresionSubscriptions();
  });

  onDestroy(() => {
    if (cleanup) cleanup();
  });

  async function onGenerar() {
    generando = true;
    try {
      const params: Record<string, unknown> = {};
      paramsTexto.split(',').forEach(pair => {
        const [k, v] = pair.split('=').map(s => s.trim());
        if (k && v) params[k] = Number(v) || v;
      });
      await generarScad(params);
    } finally {
      generando = false;
    }
  }

  function copiarScad() {
    if ($colaImpresionStore.scad) {
      navigator.clipboard?.writeText($colaImpresionStore.scad);
    }
  }
</script>

<div class="panel-disenador">
  <header class="cabecera">
    <h2>📐 Diseñador Paramétrico</h2>
    {#if $colaImpresionStore.loading}
      <span class="badge">cargando…</span>
    {/if}
  </header>

  {#if $colaImpresionStore.error}
    <div class="error">⚠ {$colaImpresionStore.error}</div>
  {/if}

  <!-- Parámetros -->
  <section class="seccion">
    <h3>Parámetros (clave=valor, separados por coma)</h3>
    <div class="fila">
      <input type="text" bind:value={paramsTexto} />
      <button on:click={onGenerar} disabled={generando || !paramsTexto.trim()}>
        {generando ? 'Generando…' : 'Generar SCAD'}
      </button>
    </div>
    <div class="presets">
      <button class="preset" on:click={() => paramsTexto = 'diametro=16, pared=1.2, relleno=20, tipo=conector_90'}>Conector 90°</button>
      <button class="preset" on:click={() => paramsTexto = 'diametro=16, pared=1.2, relleno=20, tipo=conector_t'}>Conector T</button>
      <button class="preset" on:click={() => paramsTexto = 'diametro=16, pared=1.2, relleno=20, tipo=conector_recto'}>Conector recto</button>
      <button class="preset" on:click={() => paramsTexto = 'diametro=16, pared=1.2, relleno=20, tipo=tapon'}>Tapón</button>
    </div>
  </section>

  <!-- Resultado SCAD -->
  <section class="seccion">
    <h3>SCAD generado</h3>
    {#if $colaImpresionStore.scad}
      <div class="scad-toolbar">
        <button on:click={copiarScad}>Copiar</button>
      </div>
      <pre class="scad">{$colaImpresionStore.scad}</pre>
    {:else}
      <p class="vacio">Genera un SCAD para verlo aquí.</p>
    {/if}
  </section>
</div>

<style>
  .panel-disenador { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
  .cabecera { display: flex; align-items: center; justify-content: space-between; }
  .cabecera h2 { margin: 0; font-size: 1.1rem; }
  .seccion { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.75rem; }
  .seccion h3 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--color-text-muted, #aaa); }
  .fila { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .fila input { flex: 1; min-width: 200px; padding: 0.4rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-input, #1a1a1a); color: inherit; }
  button { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-border, #444); background: var(--color-accent, #2563eb); color: #fff; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { background: rgba(220,38,38,.15); border: 1px solid #dc2626; color: #fca5a5; padding: 0.5rem; border-radius: 6px; }
  .presets { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .preset { background: var(--color-bg-item, #1a1a1a); border-color: var(--color-border, #444); color: var(--color-text-muted, #aaa); font-size: 0.8rem; }
  .preset:hover { color: #fff; border-color: var(--color-accent, #2563eb); }
  .scad-toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.4rem; }
  .scad { background: #0d0d0d; border-radius: 6px; padding: 0.5rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; }
  .badge { background: var(--color-badge, #333); border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.75rem; }
  .vacio { color: var(--color-text-muted, #888); font-style: italic; }
</style>
