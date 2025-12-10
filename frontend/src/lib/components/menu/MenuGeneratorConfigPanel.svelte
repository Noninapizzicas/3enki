<!--
  MenuGeneratorConfigPanel.svelte
  Panel de configuración para menú seleccionado: validar, exportar, aplicar POS, eliminar.

  Eventos:
  - validate: { menuId }
  - export: { menuId, format }
  - applyPos: { menuId }
  - delete: { menuId }
  - close
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FloatingPanel from '../feedback/FloatingPanel.svelte';
  import { api } from '$lib/config';

  export let open = false;
  export let menuId: string | null = null;
  export let conversationId: string | null = null;

  interface MenuInfo {
    id: string;
    nombre?: string;
    estado: 'generando' | 'generado' | 'validado' | 'aplicado' | 'error';
    productos_count?: number;
    categorias_count?: number;
    ingredientes_count?: number;
    created_at?: string;
    validated_at?: string;
  }

  const dispatch = createEventDispatcher<{
    validate: { menuId: string };
    export: { menuId: string; format: string };
    applyPos: { menuId: string };
    delete: { menuId: string };
    close: void;
  }>();

  // Estado
  let menu: MenuInfo | null = null;
  let loading = true;
  let error = '';
  let actionLoading = '';
  let exportFormat = 'json';

  // Cargar info del menú
  $: if (open && menuId) {
    loadMenu();
  }

  async function loadMenu() {
    if (!menuId) return;

    loading = true;
    error = '';

    try {
      const res = await fetch(api.moduleApi('menu-generator', `/menus/${menuId}`));
      if (!res.ok) throw new Error('Menú no encontrado');

      const data = await res.json();
      menu = {
        id: data.id,
        nombre: data.nombre || data.metadata?.title || `Menú ${data.id.slice(-6)}`,
        estado: data.estado,
        productos_count: data.productos?.length || 0,
        categorias_count: data.categorias?.length || 0,
        ingredientes_count: data.ingredientes_catalogo?.length || 0,
        created_at: data.created_at,
        validated_at: data.validated_at
      };
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error cargando menú';
    } finally {
      loading = false;
    }
  }

  async function handleValidate() {
    if (!menuId) return;

    actionLoading = 'validate';
    try {
      const res = await fetch(api.moduleApi('menu-generator', `/menus/${menuId}/validate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correcciones: [] })
      });

      if (!res.ok) throw new Error('Error validando menú');

      dispatch('validate', { menuId });
      await loadMenu(); // Refrescar estado
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error';
    } finally {
      actionLoading = '';
    }
  }

  async function handleExport() {
    if (!menuId) return;

    actionLoading = 'export';
    try {
      const res = await fetch(api.moduleApi('menu-generator', `/menus/${menuId}/export`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: exportFormat })
      });

      if (!res.ok) throw new Error('Error exportando');

      const data = await res.json();

      // Descargar archivo
      const blob = new Blob([data.content], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);

      dispatch('export', { menuId, format: exportFormat });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error';
    } finally {
      actionLoading = '';
    }
  }

  async function handleApplyPOS() {
    if (!menuId) return;

    const confirm = window.confirm(
      '¿Aplicar este menú al sistema POS?\n\nEsto importará productos, categorías e ingredientes.'
    );
    if (!confirm) return;

    actionLoading = 'apply';
    try {
      const res = await fetch(api.moduleApi('menu-generator', `/menus/${menuId}/apply-pos`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replace_existing: false })
      });

      if (!res.ok) throw new Error('Error aplicando al POS');

      dispatch('applyPos', { menuId });
      await loadMenu();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error';
    } finally {
      actionLoading = '';
    }
  }

  async function handleDelete() {
    if (!menuId) return;

    const confirm = window.confirm('¿Eliminar este menú?\n\nEsta acción no se puede deshacer.');
    if (!confirm) return;

    actionLoading = 'delete';
    try {
      // Si hay conversación, eliminar también
      if (conversationId) {
        await fetch(api.moduleApi('menu-generator', `/conversations/${conversationId}`), {
          method: 'DELETE'
        });
      }

      dispatch('delete', { menuId });
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error';
    } finally {
      actionLoading = '';
    }
  }

  function handleClose() {
    dispatch('close');
    open = false;
  }

  function getEstadoBadge(estado: string) {
    const badges: Record<string, { emoji: string; color: string; label: string }> = {
      generando: { emoji: '⏳', color: 'warning', label: 'Generando' },
      generado: { emoji: '✨', color: 'info', label: 'Generado' },
      validado: { emoji: '✅', color: 'success', label: 'Validado' },
      aplicado: { emoji: '🚀', color: 'primary', label: 'Aplicado' },
      error: { emoji: '❌', color: 'danger', label: 'Error' }
    };
    return badges[estado] || badges.generando;
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<FloatingPanel bind:open on:close={handleClose}>
  <div class="config-panel">
    <header class="panel-header">
      <span class="header-icon">⚙️</span>
      <h3>Configurar Menú</h3>
    </header>

    <div class="panel-body">
      {#if loading}
        <div class="loading">Cargando información...</div>
      {:else if error && !menu}
        <div class="error">{error}</div>
      {:else if menu}
        <!-- Info del menú -->
        <div class="menu-info">
          <div class="menu-title">
            <span class="menu-emoji">🍽️</span>
            <span class="menu-name">{menu.nombre}</span>
          </div>

          <div class="estado-badge {getEstadoBadge(menu.estado).color}">
            <span>{getEstadoBadge(menu.estado).emoji}</span>
            <span>{getEstadoBadge(menu.estado).label}</span>
          </div>
        </div>

        <!-- Estadísticas -->
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-value">{menu.productos_count}</span>
            <span class="stat-label">Productos</span>
          </div>
          <div class="stat">
            <span class="stat-value">{menu.categorias_count}</span>
            <span class="stat-label">Categorías</span>
          </div>
          <div class="stat">
            <span class="stat-value">{menu.ingredientes_count}</span>
            <span class="stat-label">Ingredientes</span>
          </div>
        </div>

        <!-- Fechas -->
        <div class="dates">
          <div class="date-item">
            <span class="date-label">Creado:</span>
            <span class="date-value">{formatDate(menu.created_at)}</span>
          </div>
          {#if menu.validated_at}
            <div class="date-item">
              <span class="date-label">Validado:</span>
              <span class="date-value">{formatDate(menu.validated_at)}</span>
            </div>
          {/if}
        </div>

        <!-- Error message -->
        {#if error}
          <div class="error-inline">{error}</div>
        {/if}

        <!-- Acciones -->
        <div class="actions">
          {#if menu.estado === 'generado'}
            <button
              class="action-btn validate"
              on:click={handleValidate}
              disabled={actionLoading !== ''}
            >
              {actionLoading === 'validate' ? '⏳' : '✅'} Validar Menú
            </button>
          {/if}

          <!-- Exportar -->
          <div class="export-row">
            <select bind:value={exportFormat} class="export-select">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="markdown">Markdown</option>
            </select>
            <button
              class="action-btn export"
              on:click={handleExport}
              disabled={actionLoading !== ''}
            >
              {actionLoading === 'export' ? '⏳' : '📤'} Exportar
            </button>
          </div>

          {#if menu.estado === 'validado'}
            <button
              class="action-btn apply"
              on:click={handleApplyPOS}
              disabled={actionLoading !== ''}
            >
              {actionLoading === 'apply' ? '⏳' : '🚀'} Aplicar a POS
            </button>
          {/if}

          <button
            class="action-btn delete"
            on:click={handleDelete}
            disabled={actionLoading !== ''}
          >
            {actionLoading === 'delete' ? '⏳' : '🗑️'} Eliminar
          </button>
        </div>
      {/if}
    </div>
  </div>
</FloatingPanel>

<style>
  .config-panel {
    --_accent: var(--menu-accent, hsl(25 95% 53%));
    --_bg: var(--panel-bg, var(--color-bg-card, hsl(220 13% 14%)));
    --_text: var(--panel-text, var(--color-text, hsl(220 10% 90%)));
    --_text-muted: var(--color-text-secondary, hsl(220 10% 60%));
    --_border: var(--color-border, hsl(220 13% 20%));
    --_radius: var(--radius-md, 8px);

    width: min(340px, 90vw);
    background: var(--_bg);
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: linear-gradient(135deg, hsla(25, 95%, 53%, 0.15), transparent);
    border-bottom: 1px solid var(--_border);
  }

  .header-icon {
    font-size: 1.25rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--_text);
  }

  .panel-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .loading,
  .error {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--_text-muted);
  }

  .error {
    color: hsl(0 70% 60%);
  }

  .menu-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .menu-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .menu-emoji {
    font-size: 1.25rem;
  }

  .menu-name {
    font-weight: 600;
    color: var(--_text);
  }

  .estado-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .estado-badge.warning {
    background: hsla(45, 90%, 50%, 0.15);
    color: hsl(45 90% 60%);
  }

  .estado-badge.info {
    background: hsla(200, 90%, 50%, 0.15);
    color: hsl(200 90% 60%);
  }

  .estado-badge.success {
    background: hsla(142, 70%, 45%, 0.15);
    color: hsl(142 70% 55%);
  }

  .estado-badge.primary {
    background: hsla(25, 95%, 53%, 0.15);
    color: var(--_accent);
  }

  .estado-badge.danger {
    background: hsla(0, 70%, 50%, 0.15);
    color: hsl(0 70% 60%);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem;
    background: hsla(220, 13%, 50%, 0.1);
    border-radius: var(--_radius);
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--_text);
  }

  .stat-label {
    font-size: 0.625rem;
    color: var(--_text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .dates {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: hsla(220, 13%, 50%, 0.05);
    border-radius: var(--_radius);
  }

  .date-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }

  .date-label {
    color: var(--_text-muted);
  }

  .date-value {
    color: var(--_text);
  }

  .error-inline {
    padding: 0.5rem;
    background: hsla(0, 70%, 50%, 0.1);
    border-radius: var(--_radius);
    color: hsl(0 70% 60%);
    font-size: 0.8125rem;
    text-align: center;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: var(--_radius);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.validate {
    background: hsla(142, 70%, 45%, 0.2);
    color: hsl(142 70% 55%);
  }

  .action-btn.validate:hover:not(:disabled) {
    background: hsla(142, 70%, 45%, 0.3);
  }

  .export-row {
    display: flex;
    gap: 0.5rem;
  }

  .export-select {
    flex: 0 0 100px;
    padding: 0.625rem 0.5rem;
    background: hsla(220, 13%, 50%, 0.1);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    color: var(--_text);
    font-size: 0.8125rem;
  }

  .action-btn.export {
    flex: 1;
    background: hsla(217, 91%, 60%, 0.2);
    color: hsl(217 91% 70%);
  }

  .action-btn.export:hover:not(:disabled) {
    background: hsla(217, 91%, 60%, 0.3);
  }

  .action-btn.apply {
    background: var(--_accent);
    color: white;
  }

  .action-btn.apply:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .action-btn.delete {
    background: hsla(0, 70%, 50%, 0.15);
    color: hsl(0 70% 60%);
  }

  .action-btn.delete:hover:not(:disabled) {
    background: hsla(0, 70%, 50%, 0.25);
  }
</style>
