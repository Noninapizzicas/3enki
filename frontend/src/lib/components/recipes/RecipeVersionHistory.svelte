<script lang="ts">
  import { versioningStore, versionTimeline, changeStats } from '$lib/stores/recetas-versioning.store';
  import { formatDistanceToNow, formatISO } from 'date-fns';
  import { es } from 'date-fns/locale';

  export let projectId: string;
  export let recetaId: string;

  let isLoading = false;
  let selectedVersion: number | null = null;

  async function loadHistory() {
    isLoading = true;
    await versioningStore.loadVersionHistory(projectId, recetaId);
    isLoading = false;
  }

  async function handleRevert(version: number) {
    if (!confirm(`¿Revertir a versión ${version}?`)) return;
    await versioningStore.revertToVersion(projectId, recetaId, version);
  }

  $: if (recetaId) {
    loadHistory();
  }
</script>

<div class="version-history">
  <div class="header">
    <h2>Historial de Versiones</h2>
    {#if $changeStats}
      <div class="stats">
        <span class="stat-badge">
          <strong>{$changeStats.totalVersions}</strong> versiones
        </span>
        <span class="stat-badge">
          {#if $changeStats.daysOld > 0}
            {$changeStats.daysOld} días
          {:else}
            Hoy
          {/if}
        </span>
      </div>
    {/if}
  </div>

  {#if isLoading}
    <div class="loading">
      <p>Cargando historial...</p>
    </div>
  {:else if $versioningStore.error}
    <div class="error">
      <p>{$versioningStore.error}</p>
    </div>
  {:else if $versionTimeline.length === 0}
    <div class="empty">
      <p>No hay versiones registradas</p>
    </div>
  {:else}
    <div class="timeline">
      {#each $versionTimeline as item (item.version)}
        <div
          class="timeline-item"
          class:selected={selectedVersion === item.version}
          class:latest={item.isLatest}
        >
          <div class="timeline-marker" class:latest={item.isLatest}>
            <span class="version-number">v{item.version}</span>
          </div>

          <div class="timeline-content">
            <div class="header-row">
              <h3>{item.nombre}</h3>
              <span class="time" title={formatISO(item.cambiado_at)}>
                {formatDistanceToNow(item.cambiado_at, { locale: es, addSuffix: true })}
              </span>
            </div>

            <div class="description">
              {item.cambios_descripcion}
            </div>

            <div class="metadata">
              <span class="by">Por: {item.cambiado_por || 'Sistema'}</span>
              {#if item.cambios && item.cambios.length > 0}
                <span class="changes-count">
                  {item.cambios.length} campo(s) cambiad(o)
                </span>
              {/if}
            </div>

            <div class="actions">
              <button
                class="btn-secondary"
                on:click={() => (selectedVersion = selectedVersion === item.version ? null : item.version)}
              >
                {selectedVersion === item.version ? 'Cerrar' : 'Ver Detalles'}
              </button>

              {#if !item.isLatest}
                <button
                  class="btn-primary"
                  on:click={() => handleRevert(item.version)}
                >
                  Revertir a esta versión
                </button>
              {/if}
            </div>

            {#if selectedVersion === item.version && item.cambios && item.cambios.length > 0}
              <div class="changes-detail">
                <h4>Cambios detectados:</h4>
                <ul>
                  {#each item.cambios as change}
                    <li>
                      <span class="field">{change.campo}</span>
                      <span class="arrow">→</span>
                      <span class="new-value">{JSON.stringify(change.nuevo).substring(0, 40)}...</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .version-history {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
    background: var(--color-bg-secondary);
    border-radius: 8px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .stats {
    display: flex;
    gap: 0.5rem;
  }

  .stat-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: var(--color-accent-soft);
    border-radius: 999px;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .loading,
  .error,
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-secondary);
  }

  .error {
    background: var(--color-error-soft);
    color: var(--color-error);
    border-radius: 4px;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .timeline-item {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .timeline-item:hover {
    border-color: var(--color-accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .timeline-item.latest {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .timeline-item.selected {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .timeline-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    min-width: 48px;
    background: var(--color-border);
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .timeline-marker.latest {
    background: var(--color-accent);
    color: white;
  }

  .version-number {
    display: block;
  }

  .timeline-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }

  .header-row h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .description {
    font-size: 0.95rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .metadata {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--color-text-tertiary);
  }

  .by,
  .changes-count {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .btn-primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .changes-detail {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.85rem;
  }

  .changes-detail h4 {
    margin: 0 0 0.5rem 0;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .changes-detail ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .changes-detail li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0;
    color: var(--color-text-tertiary);
  }

  .field {
    font-weight: 500;
    color: var(--color-text-secondary);
    min-width: 120px;
  }

  .arrow {
    color: var(--color-border);
  }

  .new-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    background: var(--color-accent-soft);
    padding: 0.125rem 0.5rem;
    border-radius: 2px;
  }
</style>
