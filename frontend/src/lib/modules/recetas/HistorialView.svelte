<script lang="ts">
  /**
   * HistorialView — versiones anteriores de una receta. Solo lectura.
   *   - loadHistorial(recetaId): resumen de cada version (cards de la lista).
   *   - "Ver diff": loadVersionSnapshot bajo demanda + diff inline (Q3=B)
   *     contra la receta actual cacheada en selectedReceta.
   *   - "Revertir": pre-rellena el chat (Postura B), no muta.
   */

  import { onMount } from 'svelte';
  import {
    loadHistorial,
    loadVersionSnapshot,
    selectedReceta,
    type RecetaHistorialResult,
    type RecetaVersionSnapshot
  } from '$lib/stores/recetas';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let recetaId: string | null = null;
  export let onBack: () => void;

  let resumen: RecetaHistorialResult | null = null;
  let loading = false;
  let error: string | null = null;

  // Preview de diff (Q3=B inline) cargado bajo demanda.
  let previewVersionId: number | string | null = null;
  let snapshotPreview: RecetaVersionSnapshot | null = null;
  let previewError: string | null = null;
  let previewLoading = false;

  $: actual = $selectedReceta;

  onMount(async () => {
    if (!recetaId) return;
    loading = true;
    try {
      resumen = await loadHistorial(recetaId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  });

  function humanizeFecha(iso?: string): string {
    if (!iso) return 'sin fecha';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  // Diff generico campo-a-campo: robusto frente a variaciones de nombre de
  // campo entre el snapshot crudo y la receta actual. Compara valores escalares
  // y resume arrays/objetos por tamaño.
  function summarizeVal(v: unknown): string {
    if (Array.isArray(v)) return `${v.length} elemento${v.length === 1 ? '' : 's'}`;
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  const DIFF_SKIP = new Set(['version', '_archived_at', 'id', 'history', 'updated_at', '_updated_at']);

  $: diff = (() => {
    if (!snapshotPreview) return [] as { campo: string; antes: string; despues: string }[];
    const out: { campo: string; antes: string; despues: string }[] = [];
    const cur = (actual ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(snapshotPreview)) {
      if (DIFF_SKIP.has(key)) continue;
      const antes = summarizeVal((snapshotPreview as Record<string, unknown>)[key]);
      const despues = summarizeVal(cur[key]);
      if (antes !== despues) out.push({ campo: key, antes, despues });
    }
    return out;
  })();

  async function handleVerDiff(versionId: number | string) {
    if (previewVersionId === versionId) {
      // toggle: cerrar preview ya abierto
      previewVersionId = null;
      snapshotPreview = null;
      return;
    }
    if (!recetaId) return;
    previewVersionId = versionId;
    snapshotPreview = null;
    previewError = null;
    previewLoading = true;
    try {
      snapshotPreview = await loadVersionSnapshot(recetaId, versionId);
    } catch (err) {
      previewError = (err as Error).message;
    } finally {
      previewLoading = false;
    }
  }

  function handleRevertir(archivedAt?: string) {
    const nombre = resumen?.nombre ?? '';
    prefillChatInput(`Revierte la receta "${nombre}" a la versión del ${humanizeFecha(archivedAt)}.`);
  }
</script>

<div class="historial">
  <button class="back-btn" on:click={onBack}>← Volver al detalle</button>

  {#if loading}
    <div class="loading">Cargando historial...</div>
  {:else if error}
    <div class="error"><span>{error}</span></div>
  {:else if resumen}
    <h3>Historial de versiones de {resumen.nombre}</h3>
    <p class="subtitle">
      Versión actual: v{resumen.version_actual} · {resumen.versiones_anteriores} versi{resumen.versiones_anteriores === 1 ? 'ón' : 'ones'} anterior{resumen.versiones_anteriores === 1 ? '' : 'es'}
    </p>

    {#if resumen.historial.length === 0}
      <div class="empty"><p>Esta receta no tiene versiones anteriores.</p></div>
    {:else}
      <div class="version-list">
        {#each [...resumen.historial].sort((a, b) => Number(b.version) - Number(a.version)) as v (v.version)}
          <div class="version-card">
            <div class="version-header">
              <span class="version-tag">v{v.version}</span>
              <span class="version-fecha">{humanizeFecha(v.archived_at)}</span>
            </div>
            <div class="version-meta">
              {#if v.nombre}<span>{v.nombre}</span>{/if}
              {#if typeof v.porciones === 'number'}<span>{v.porciones} porciones</span>{/if}
              {#if v.dificultad != null}<span>dificultad {v.dificultad}</span>{/if}
              <span>{v.ingredientes_count} ingrediente{v.ingredientes_count === 1 ? '' : 's'}</span>
            </div>
            <div class="version-actions">
              <button class="vbtn" on:click={() => handleVerDiff(v.version)}>
                {previewVersionId === v.version ? 'Ocultar diff' : 'Ver diff'}
              </button>
              <button class="vbtn" on:click={() => handleRevertir(v.archived_at)}>Revertir a esta versión</button>
            </div>

            {#if previewVersionId === v.version}
              <div class="diff-box">
                {#if previewLoading}
                  <p class="diff-loading">Cargando diff...</p>
                {:else if previewError}
                  <p class="diff-error">{previewError}</p>
                {:else if diff.length === 0}
                  <p class="diff-empty">Sin diferencias respecto a la versión actual.</p>
                {:else}
                  <p class="diff-title">Cambios respecto a la versión actual:</p>
                  <ul class="diff-list">
                    {#each diff as d}
                      <li>
                        <span class="diff-campo">{d.campo}</span>:
                        <span class="diff-antes">{d.antes}</span>
                        <span class="diff-arrow">→</span>
                        <span class="diff-despues">{d.despues}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <p class="hint chat-hint">
      "Revertir" pre-rellena el chat — revisa el mensaje y envíalo para que el agente lo ejecute.
    </p>
  {/if}
</div>

<style>
  .historial { height: 100%; overflow-y: auto; padding: 12px; }

  .back-btn {
    background: none;
    border: none;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .loading { padding: 12px; text-align: center; color: var(--text-secondary, rgba(161, 161, 170, 1)); font-size: 12px; }
  .error {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
    border-radius: 6px;
  }
  .empty { text-align: center; padding: 24px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  h3 { margin: 0 0 4px; font-size: 15px; }
  .subtitle { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 0 0 12px; }

  .version-list { display: flex; flex-direction: column; gap: 6px; }
  .version-card {
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
  }
  .version-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .version-tag { font-weight: 600; font-family: monospace; color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .version-fecha { font-size: 11px; color: var(--text-secondary, rgba(113, 113, 122, 1)); }
  .version-meta {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    margin-bottom: 8px;
  }
  .version-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .vbtn {
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }
  .vbtn:hover { background: rgba(96, 165, 250, 0.15); border-color: var(--accent-color, rgba(96, 165, 250, 1)); }

  .diff-box {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(96, 165, 250, 0.06);
    border: 1px solid rgba(96, 165, 250, 0.2);
    border-radius: 6px;
  }
  .diff-loading, .diff-empty { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 0; font-style: italic; }
  .diff-error { font-size: 11px; color: rgba(248, 113, 113, 1); margin: 0; }
  .diff-title { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 0 0 6px; }
  .diff-list { margin: 0; padding-left: 16px; font-size: 12px; }
  .diff-list li { margin-bottom: 4px; }
  .diff-campo { font-weight: 600; }
  .diff-antes { color: rgba(248, 113, 113, 1); font-family: monospace; }
  .diff-arrow { color: var(--text-secondary, rgba(113, 113, 122, 1)); margin: 0 2px; }
  .diff-despues { color: #22c55e; font-family: monospace; }

  .hint { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .chat-hint {
    margin-top: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.06);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-style: italic;
    text-align: center;
  }
</style>
