<script lang="ts">
  import { versioningStore, selectedVersionsDiff, versionTimeline } from '$lib/stores/recetas-versioning.store';
  import { formatISO, formatDistanceToNow } from 'date-fns';
  import { es } from 'date-fns/locale';
  import type { RecetaCompleta } from '$lib/stores/recetas-v2.types';

  export let projectId: string;
  export let recetaId: string;

  let version1: number | null = null;
  let version2: number | null = null;

  function handleVersionSelect(v1: number, v2: number) {
    version1 = v1;
    version2 = v2;
    versioningStore.setSelectedVersions(v1, v2);
  }

  function clearComparison() {
    version1 = null;
    version2 = null;
    versioningStore.clearSelectedVersions();
  }

  function formatFieldName(field: string): string {
    return field
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }

  function formatValue(value: any): string {
    if (value === null || value === undefined) return '(vacío)';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function getChangedFields(diff: any[] | undefined): string[] {
    if (!diff) return [];
    return [...new Set(diff.map(d => d.campo))];
  }
</script>

<div class="comparator">
  {#if !$selectedVersionsDiff}
    <div class="selector">
      <h3>Seleccionar Versiones para Comparar</h3>

      <div class="version-selector">
        <div class="selector-group">
          <label>Versión 1:</label>
          <select bind:value={version1}>
            <option value={null}>- Seleccionar -</option>
            {#each $versionTimeline as v (v.version)}
              <option value={v.version}>
                v{v.version} - {v.nombre}
                ({formatDistanceToNow(v.cambiado_at, { locale: es })})
              </option>
            {/each}
          </select>
        </div>

        <div class="selector-group">
          <label>Versión 2:</label>
          <select bind:value={version2}>
            <option value={null}>- Seleccionar -</option>
            {#each $versionTimeline as v (v.version)}
              <option value={v.version}>
                v{v.version} - {v.nombre}
                ({formatDistanceToNow(v.cambiado_at, { locale: es })})
              </option>
            {/each}
          </select>
        </div>

        <button
          class="btn-primary"
          disabled={version1 === null || version2 === null || version1 === version2}
          on:click={() => handleVersionSelect(version1!, version2!)}
        >
          Comparar
        </button>
      </div>
    </div>
  {:else if $selectedVersionsDiff}
    <div class="comparison">
      <div class="comparison-header">
        <div class="version-info">
          <div class="version-box version-1">
            <h3>Versión {$selectedVersionsDiff.version1.num}</h3>
            <p class="desc">{$selectedVersionsDiff.version1.description}</p>
            <p class="meta">
              {formatDistanceToNow($selectedVersionsDiff.version1.changedAt, {
                locale: es,
                addSuffix: true
              })}
            </p>
            <p class="by">Por: {$selectedVersionsDiff.version1.changedBy || 'Sistema'}</p>
          </div>

          <div class="arrow">→</div>

          <div class="version-box version-2">
            <h3>Versión {$selectedVersionsDiff.version2.num}</h3>
            <p class="desc">{$selectedVersionsDiff.version2.description}</p>
            <p class="meta">
              {formatDistanceToNow($selectedVersionsDiff.version2.changedAt, {
                locale: es,
                addSuffix: true
              })}
            </p>
            <p class="by">Por: {$selectedVersionsDiff.version2.changedBy || 'Sistema'}</p>
          </div>
        </div>

        <button class="btn-close" on:click={clearComparison}>✕</button>
      </div>

      <div class="differences">
        {#if $selectedVersionsDiff.diffs.length === 0}
          <div class="no-changes">
            <p>No hay cambios entre estas versiones</p>
          </div>
        {:else}
          <div class="changes-summary">
            <span class="badge">
              {$selectedVersionsDiff.diffs.length} campo(s) modificado(s)
            </span>
          </div>

          <div class="changes-list">
            {#each $selectedVersionsDiff.diffs as change (change.campo)}
              <div class="change-item">
                <div class="field-name">
                  <span class="icon">◆</span>
                  {formatFieldName(change.campo)}
                </div>

                <div class="change-values">
                  <div class="value-box anterior">
                    <span class="label">Anterior</span>
                    <div class="value-content">
                      {formatValue(change.anterior)}
                    </div>
                  </div>

                  <div class="separator">→</div>

                  <div class="value-box nuevo">
                    <span class="label">Nuevo</span>
                    <div class="value-content">
                      {formatValue(change.nuevo)}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .comparator {
    padding: 2rem;
    background: var(--color-bg-secondary);
    border-radius: 8px;
  }

  .selector {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .selector h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .version-selector {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .selector-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    min-width: 200px;
  }

  .selector-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .selector-group select {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
  }

  .btn-primary {
    padding: 0.5rem 1.5rem;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .comparison {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .comparison-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .version-info {
    display: flex;
    gap: 1.5rem;
    flex: 1;
    align-items: center;
  }

  .version-box {
    flex: 1;
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid var(--color-border);
  }

  .version-box.version-1 {
    background: var(--color-error-soft);
    border-color: rgba(220, 53, 69, 0.3);
  }

  .version-box.version-2 {
    background: var(--color-success-soft);
    border-color: rgba(40, 167, 69, 0.3);
  }

  .version-box h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .version-box p {
    margin: 0.25rem 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .version-box .desc {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .version-box .by {
    font-size: 0.8rem;
    color: var(--color-text-tertiary);
  }

  .arrow {
    color: var(--color-text-secondary);
    font-size: 1.5rem;
    align-self: center;
  }

  .btn-close {
    width: 40px;
    height: 40px;
    border: none;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .btn-close:hover {
    background: var(--color-error-soft);
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .differences {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--color-bg-primary);
    border-radius: 6px;
    border: 1px solid var(--color-border);
  }

  .no-changes {
    text-align: center;
    padding: 2rem;
    color: var(--color-text-secondary);
  }

  .changes-summary {
    display: flex;
    gap: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: var(--color-accent);
    color: white;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .changes-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .change-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--color-bg-secondary);
    border-radius: 4px;
    border: 1px solid var(--color-border);
  }

  .field-name {
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }

  .field-name .icon {
    color: var(--color-accent);
  }

  .change-values {
    display: flex;
    gap: 1rem;
    align-items: stretch;
  }

  .value-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 4px;
  }

  .value-box.anterior {
    background: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.2);
  }

  .value-box.nuevo {
    background: rgba(40, 167, 69, 0.1);
    border: 1px solid rgba(40, 167, 69, 0.2);
  }

  .value-box .label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .value-content {
    font-family: monospace;
    font-size: 0.85rem;
    color: var(--color-text-primary);
    word-break: break-word;
    white-space: pre-wrap;
    max-height: 150px;
    overflow-y: auto;
  }

  .separator {
    display: flex;
    align-items: center;
    color: var(--color-text-secondary);
    font-weight: 600;
  }
</style>
