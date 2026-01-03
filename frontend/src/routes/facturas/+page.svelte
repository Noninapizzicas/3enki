<script lang="ts">
  /**
   * Página de Facturas
   *
   * Usa AppShell que ya incluye ChatConfig + ChatInput + ChatTools.
   * Work-bar y System-bar vacíos (igual que chat principal).
   */
  import { AppShell } from '$lib/components/layout';
  import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

  // Estado local de facturas
  let facturas: any[] = [];
  let loading = false;
  let error: string | null = null;
  let searchQuery = '';
  let statusFilter = '';

  // Inicialización cuando MQTT está conectado
  function handleConnected() {
    perfStart('Facturas.init');
    logMsg('✅ Facturas page ready');
    perfEnd('Facturas.init');
  }
</script>

<AppShell onConnected={handleConnected}>
  <!-- Content: Gestión de facturas -->
  <div class="facturas-page" slot="content">
    <!-- Header -->
    <header class="page-header">
      <h1>📄 Facturas</h1>
      <div class="actions">
        <input
          type="text"
          placeholder="Buscar..."
          class="search-input"
          bind:value={searchQuery}
        />
        <select class="filter-select" bind:value={statusFilter}>
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
          <option value="vencida">Vencida</option>
        </select>
        <button class="btn primary">➕ Nueva</button>
      </div>
    </header>

    <!-- Lista o estado vacío -->
    {#if loading}
      <div class="center-message">Cargando facturas...</div>
    {:else if error}
      <div class="center-message error">{error}</div>
    {:else if facturas.length === 0}
      <div class="empty-state">
        <span class="icon">📄</span>
        <h2>No hay facturas</h2>
        <p>Crea tu primera factura para comenzar</p>
        <button class="btn primary">➕ Nueva Factura</button>
      </div>
    {:else}
      <div class="facturas-list">
        {#each facturas as factura (factura.id)}
          <div class="factura-item">
            <span class="numero">{factura.numero}</span>
            <span class="cliente">{factura.cliente}</span>
            <span class="total">{factura.total}</span>
            <span class="estado estado-{factura.estado}">{factura.estado}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</AppShell>

<style>
  .facturas-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    overflow-y: auto;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    flex-shrink: 0;
  }

  .page-header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .search-input {
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-secondary, #1a1a2e);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
    width: 180px;
  }

  .filter-select {
    padding: 0.375rem 0.75rem;
    background: var(--color-bg-secondary, #1a1a2e);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
  }

  .btn {
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn.primary {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .btn.primary:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--color-text-muted, #a3a3a3);
  }

  .empty-state .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
    color: var(--color-text, #e5e5e5);
  }

  .empty-state p {
    margin: 0 0 1.5rem;
  }

  .facturas-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .factura-item {
    display: grid;
    grid-template-columns: 100px 1fr 100px 100px;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-bg-secondary, #1a1a2e);
    border-radius: 0.5rem;
    align-items: center;
  }

  .factura-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
  }

  .numero {
    font-family: ui-monospace, monospace;
    font-weight: 500;
  }

  .total {
    font-weight: 600;
    text-align: right;
  }

  .estado {
    text-align: center;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .estado-pendiente {
    background: rgba(251, 191, 36, 0.2);
    color: #fbbf24;
  }

  .estado-pagada {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .estado-vencida {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .center-message {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted, #a3a3a3);
  }

  .center-message.error {
    color: var(--color-error, #ef4444);
  }
</style>
