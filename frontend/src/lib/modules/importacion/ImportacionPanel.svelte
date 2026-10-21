<script lang="ts">
  /**
   * ImportacionPanel — CONVERSOR multi-formato del taller 3D (chat_tool).
   *
   * Operación PUNTUAL disparada por el dueño desde el chat, no un panel
   * persistente: formulario de importación (url/origen/categoría/archivo) +
   * leer metadatos antes. Feedback por señal: en_progreso → importada(✅)/fallida(❌).
   * GCODE va a la cúpula; STL/3MF al catálogo. CERO juicio.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    importacionStore, metadatosArchivo, importacionImportando,
    leerMetadatos, importarArchivo, resetImportacionStore, type ImportarFormato
  } from '$lib/stores/importacion';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  let proyectoId = '';
  let archivo = '';
  let formato: ImportarFormato = 'STL';
  let uso = '', filamentoSug = '', origenUrl = '';

  const formatos: ImportarFormato[] = ['STL', '3MF', 'GCODE'];

  $: metadatos = $metadatosArchivo;
  $: importando = $importacionImportando;
  $: cargandoMetadatos = $importacionStore.loading;
  $: resultado = $importacionStore.resultado;
  $: error = $importacionStore.error;

  function proyectoActual(): string {
    return proyectoId || '';
  }

  async function handleLeerMetadatos() {
    const pid = proyectoActual();
    if (!pid || !archivo.trim()) return;
    await leerMetadatos(pid, archivo.trim(), formato);
  }

  async function handleImportar() {
    const pid = proyectoActual();
    if (!pid) return;
    const data: Record<string, unknown> = { archivo: archivo.trim() };
    if (formato) data.formato = formato;
    if (uso.trim()) data.uso = uso.trim();
    if (filamentoSug.trim()) data.filamento_sug = filamentoSug.trim();
    if (origenUrl.trim()) data.origenUrl = origenUrl.trim();
    const ok = await importarArchivo(pid, data);
    if (ok.success) {
      archivo = ''; uso = ''; filamentoSug = ''; origenUrl = '';
    }
  }

  onMount(() => {
    const unsub = sessionProjectId.subscribe(v => { proyectoId = v || ''; });
    return unsub;
  });

  onDestroy(() => {
    resetImportacionStore();
  });
</script>

<div class="panel-importacion">
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-title">📥 Importación de modelos</span>
      <span class="panel-sub">Frontera de entrada de la moneda real · chat_tool</span>
    </div>
  </header>

  {#if error}<div class="error">⚠ {error}</div>{/if}
  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✅' : resultado.type === 'error' ? '❌' : '⏳'} {resultado.message}
    </div>
  {/if}

  <div class="content">
    <div class="form-section">
      <h3 class="form-titulo">Importar un archivo externo</h3>
      <p class="form-hint">STL/3MF fuente → catálogo como ficha; GCODE ya preparado → cúpula (ArchivoPreparado). Lee metadatos antes para previsualizar.</p>

      <label class="form-label">
        <span>Ruta o URL del archivo *</span>
        <input class="input mono" bind:value={archivo} placeholder="STL / 3MF / GCODE (ruta o url)" />
      </label>

      <label class="form-label">
        <span>Formato</span>
        <div class="chip-group">
          {#each formatos as f}
            <button class="chip" class:active={formato === f} on:click={() => formato = f}>{f}</button>
          {/each}
        </div>
      </label>

      <button class="btn secondary" on:click={handleLeerMetadatos} disabled={!archivo.trim() || cargandoMetadatos}>
        {cargandoMetadatos ? 'Leyendo…' : '👁 Leer metadatos'}
      </button>

      {#if metadatos}
        <div class="metadatos card">
          <h4 class="sub-titulo">Metadatos del archivo</h4>
          <dl>
            <dt>Nombre</dt><dd>{metadatos.nombre || 'desconocido'}</dd>
            <dt>Unidades</dt><dd>{metadatos.unidades || 'desconocido'}</dd>
            <dt>Material</dt><dd>{metadatos.material || 'desconocido'}</dd>
            <dt>Formatos</dt><dd>{(metadatos.formatos || []).join(', ') || 'desconocido'}</dd>
            <dt>Dimensiones</dt><dd>{metadatos.dimensiones || 'desconocido'}</dd>
          </dl>
        </div>
      {/if}

      <div class="form-divider"></div>

      <label class="form-label">
        <span>Qué resuelve la pieza (opcional)</span>
        <input class="input" bind:value={uso} placeholder="uso" />
      </label>
      <label class="form-label">
        <span>Filamento sugerido (opcional)</span>
        <input class="input" bind:value={filamentoSug} placeholder="ej: PETG" />
      </label>
      <label class="form-label">
        <span>URL de origen (opcional)</span>
        <input class="input mono" bind:value={origenUrl} placeholder="https://…" />
      </label>

      <button class="btn primary" on:click={handleImportar} disabled={!archivo.trim() || importando}>
        {importando ? 'Importando…' : '⬆ Importar modelo'}
      </button>
    </div>
  </div>
</div>

<style>
  .panel-importacion { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
  .panel-header { padding: 10px 12px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; }
  .header-left { display: flex; align-items: baseline; gap: 10px; }
  .panel-title { font-weight: 600; color: #22c55e; }
  .panel-sub { font-size: 0.7rem; color: #777; }
  .error, .resultado { padding: 6px 12px; font-size: 0.75rem; border-bottom: 1px solid #222; }
  .error { color: #ef4444; }
  .resultado.ok { color: #22c55e; } .resultado.error { color: #ef4444; } .resultado.info { color: #22c55e; }
  .content { flex: 1; overflow-y: auto; padding: 12px; }
  .form-section { max-width: 520px; display: flex; flex-direction: column; gap: 10px; }
  .form-titulo { font-size: 0.95rem; color: #eee; margin: 0; }
  .form-hint { font-size: 0.72rem; color: #888; margin: 0; }
  .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: #aaa; }
  .form-divider { height: 1px; background: #242424; margin: 2px 0; }
  .input { background: #151515; border: 1px solid #2a2a2a; border-radius: 6px; color: #e5e5e5; padding: 7px 9px; font-size: 0.8rem; }
  .input.mono { font-family: ui-monospace, monospace; }
  .chip-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: #1a1a1a; border: 1px solid #2a2a2a; color: #aaa; border-radius: 14px; padding: 4px 12px; font-size: 0.72rem; cursor: pointer; }
  .chip.active { background: rgba(34,197,94,.15); border-color: #22c55e; color: #22c55e; }
  .btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; border-radius: 6px; padding: 8px 14px; font-size: 0.8rem; cursor: pointer; }
  .btn.primary { background: #22c55e; border-color: #22c55e; color: #081; font-weight: 600; }
  .btn.secondary { border-color: #3f3f3f; color: #bbb; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .card { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 10px; }
  .sub-titulo { font-size: 0.78rem; color: #aaa; margin: 0 0 8px; }
  .metadatos dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; font-size: 0.75rem; }
  .metadatos dt { color: #888; } .metadatos dd { margin: 0; color: #ddd; }
</style>
