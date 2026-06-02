<script lang="ts">
  /**
   * HistorialCartaView — versiones anteriores de una carta. Solo lectura.
   *   - loadHistorial(cartaId): resumen de cada snapshot (cards de la lista).
   *   - "Ver diff": loadVersionSnapshot bajo demanda + diff inline contra la
   *     carta actual cacheada en cartaSeleccionada (shape abierto, campo a campo).
   *   - "Restaurar": pre-rellena el chat (Postura B, Q5=A), no muta.
   */

  import { onMount } from 'svelte';
  import {
    loadHistorial,
    loadVersionSnapshot,
    cartaSeleccionada,
    type CartaVersionResumen,
    type Carta
  } from '$lib/stores/carta-manager';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let cartaId: string | null = null;
  export let onBack: () => void;

  let resumen: CartaVersionResumen[] = [];
  let loading = false;
  let error: string | null = null;

  let previewKey: string | null = null;
  let snapshotPreview: Carta | null = null;
  let previewLoading = false;
  let previewError: string | null = null;

  $: actual = $cartaSeleccionada;

  onMount(async () => {
    if (!cartaId) return;
    loading = true;
    try {
      resumen = await loadHistorial(cartaId);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  });

  function humanizeFecha(s?: string): string {
    if (!s) return 'sin fecha';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  }

  function summarizeVal(v: unknown): string {
    if (Array.isArray(v)) return `${v.length} elemento${v.length === 1 ? '' : 's'}`;
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  const DIFF_SKIP = new Set(['id', 'meta', 'updated_at', 'created_at', '_archived_at']);

  $: diff = (() => {
    if (!snapshotPreview) return [] as { campo: string; antes: string; despues: string }[];
    const out: { campo: string; antes: string; despues: string }[] = [];
    const cur = (actual ?? {}) as Record<string, unknown>;
    const snap = snapshotPreview as Record<string, unknown>;
    const keys = new Set([...Object.keys(snap), ...Object.keys(cur)]);
    for (const key of keys) {
      if (DIFF_SKIP.has(key)) continue;
      const antes = summarizeVal(snap[key]);
      const despues = summarizeVal(cur[key]);
      if (antes !== despues) out.push({ campo: key, antes, despues });
    }
    return out;
  })();

  async function handleVerDiff(archivedAt: string) {
    if (previewKey === archivedAt) {
      previewKey = null;
      snapshotPreview = null;
      return;
    }
    if (!cartaId) return;
    previewKey = archivedAt;
    snapshotPreview = null;
    previewError = null;
    previewLoading = true;
    try {
      snapshotPreview = await loadVersionSnapshot(cartaId, archivedAt);
    } catch (err) {
      previewError = (err as Error).message;
    } finally {
      previewLoading = false;
    }
  }

  function handleRestaurar(archivedAt: string) {
    const nombre = actual?.nombre ?? '';
    prefillChatInput(`Restaura la carta "${nombre}" a la version del ${humanizeFecha(archivedAt)}.`);
  }
</script>

<div class="historial">
  <button class="back-btn" on:click={onBack}>← Volver al detalle</button>

  {#if loading}
    <div class="loading">Cargando historial...</div>
  {:else if error}
    <div class="error"><span>{error}</span></div>
  {:else}
    <h3>Historial de versiones{actual ? ' de ' + actual.nombre : ''}</h3>

    {#if resumen.length === 0}
      <div class="empty"><p>Sin historial todavia.</p></div>
    {:else}
      <div class="version-list">
        {#each resumen as v (v.archived_at)}
          <div class="version-card">
            <div class="version-header">
              {#if v.version !== undefined}<span class="version-tag">v{v.version}</span>{/if}
              <span class="version-fecha">{humanizeFecha(v.archived_at)}</span>
            </div>
            <div class="version-meta">
              {#if v.nombre}<span>{v.nombre}</span>{/if}
              {#if v.productos_count !== undefined}<span>{v.productos_count} producto{v.productos_count === 1 ? '' : 's'}</span>{/if}
              {#if v.categorias_count !== undefined}<span>{v.categorias_count} categor{v.categorias_count === 1 ? 'ia' : 'ias'}</span>{/if}
            </div>
            <div class="version-actions">
              <button class="vbtn" on:click={() => handleVerDiff(v.archived_at)}>
                {previewKey === v.archived_at ? 'Ocultar diff' : 'Ver diff'}
              </button>
              <button class="vbtn" on:click={() => handleRestaurar(v.archived_at)}>Restaurar a esta version</button>
            </div>

            {#if previewKey === v.archived_at}
              <div class="diff-box">
                {#if previewLoading}
                  <p class="diff-loading">Cargando diff...</p>
                {:else if previewError}
                  <p class="diff-error">{previewError}</p>
                {:else if diff.length === 0}
                  <p class="diff-loading">Sin diferencias respecto a la version actual.</p>
                {:else}
                  <p class="diff-title">Cambios respecto a la version actual:</p>
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
      "Restaurar" pre-rellena el chat — revisa el mensaje y envialo para que el agente lo ejecute.
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

  h3 { margin: 0 0 12px; font-size: 15px; }

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
  .version-fecha { font-size: 11px; color: var(--text-secondary, rgba(113, 113, 122, 1)); margin-left: auto; }
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
  .diff-loading { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 0; font-style: italic; }
  .diff-error { font-size: 11px; color: rgba(248, 113, 113, 1); margin: 0; }
  .diff-title { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin: 0 0 6px; }
  .diff-list { margin: 0; padding-left: 16px; font-size: 12px; }
  .diff-list li { margin-bottom: 4px; }
  .diff-campo { font-weight: 600; }
  .diff-antes { color: rgba(248, 113, 113, 1); font-family: monospace; }
  .diff-arrow { color: var(--text-secondary, rgba(113, 113, 122, 1)); margin: 0 2px; }
  .diff-despues { color: rgb(34, 197, 94); font-family: monospace; }

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
