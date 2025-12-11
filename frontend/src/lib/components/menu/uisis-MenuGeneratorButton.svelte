<!--
  MenuGeneratorButton.svelte
  ==========================
  Botón con triple interacción para gestión de menús generados.
  Usa GestureButton como base para el manejo de gestos.

  Interacciones:
  - tap: Selector de menús/conversaciones
  - dbl tap: Crear nueva conversación
  - long press: Configurar menú seleccionado

  Eventos:
  - select: { menuId, conversationId }
  - create: { title, templateId, aiConfig }
  - validate: { menuId }
  - export: { menuId, format }
  - applyPos: { menuId }
  - delete: { menuId }

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GestureButton } from '$components/ui';
  import FloatingPanel from '../feedback/FloatingPanel.svelte';
  import MenuGeneratorAddPanel from './uisis-MenuGeneratorAddPanel.svelte';
  import MenuGeneratorConfigPanel from './uisis-MenuGeneratorConfigPanel.svelte';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  interface MenuItem {
    id: string;
    type: 'menu' | 'conversation';
    title: string;
    estado?: string;
    productosCount?: number;
    updatedAt?: string;
    conversationId?: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  export let size: Size = 'md';
  export let showLabel = true;
  export let disabled = false;

  // ============================================================================
  // STATE
  // ============================================================================

  // Panel states
  let selectorOpen = false;
  let addOpen = false;
  let configOpen = false;

  // Selection state
  let selectedMenuId: string | null = null;
  let selectedConversationId: string | null = null;

  // Items list
  let items: MenuItem[] = [];
  let loading = false;
  let error = '';

  const currentIcon = '🍽️';
  const currentLabel = 'Menú';

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: hasSelection = selectedMenuId !== null;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { menuId: string | null; conversationId: string | null };
    create: { title: string; templateId: string | null; aiConfig: any };
    validate: { menuId: string };
    export: { menuId: string; format: string };
    applyPos: { menuId: string };
    delete: { menuId: string };
  }>();

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    selectorOpen = true;
  }

  function handleGestureAdd(): void {
    addOpen = true;
  }

  function handleGestureConfig(): void {
    if (selectedMenuId) {
      configOpen = true;
    } else {
      // Si no hay menú seleccionado, mostrar selector primero
      selectorOpen = true;
    }
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  // Cargar items cuando se abre el selector
  $: if (selectorOpen) {
    loadItems();
  }

  async function loadItems() {
    loading = true;
    error = '';
    items = [];

    try {
      // Cargar conversaciones y menús en paralelo
      const [convRes, menuRes] = await Promise.all([
        fetch(api.moduleApi('menu-generator', '/conversations?limit=20')),
        fetch(api.moduleApi('menu-generator', '/menus'))
      ]);

      const convData = await convRes.json();
      const menuData = await menuRes.json();

      // Mapear conversaciones
      const conversations = (convData.conversations || []).map((c: any) => ({
        id: c.menuId || c.id,
        type: 'conversation' as const,
        title: c.title || `Conversación ${c.id.slice(-6)}`,
        estado: c.status,
        conversationId: c.id,
        updatedAt: c.updatedAt
      }));

      // Mapear menús sin conversación
      const menus = (menuData.menus || [])
        .filter((m: any) => !conversations.some((c: MenuItem) => c.id === m.id))
        .map((m: any) => ({
          id: m.id,
          type: 'menu' as const,
          title: `Menú ${m.id.slice(-6)}`,
          estado: m.estado,
          productosCount: m.productos_count,
          updatedAt: m.created_at
        }));

      items = [...conversations, ...menus];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error cargando datos';
    } finally {
      loading = false;
    }
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleItemSelect(item: MenuItem) {
    selectedMenuId = item.type === 'menu' ? item.id : item.id;
    selectedConversationId = item.conversationId || null;

    dispatch('select', {
      menuId: selectedMenuId,
      conversationId: selectedConversationId
    });

    selectorOpen = false;
  }

  function handleCreate(e: CustomEvent) {
    dispatch('create', e.detail);
  }

  function handleValidate(e: CustomEvent) {
    dispatch('validate', e.detail);
  }

  function handleExport(e: CustomEvent) {
    dispatch('export', e.detail);
  }

  function handleApplyPos(e: CustomEvent) {
    dispatch('applyPos', e.detail);
  }

  function handleDelete(e: CustomEvent) {
    dispatch('delete', e.detail);
    selectedMenuId = null;
    selectedConversationId = null;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  function getEstadoEmoji(estado?: string) {
    const emojis: Record<string, string> = {
      generando: '⏳',
      generado: '✨',
      validado: '✅',
      aplicado: '🚀',
      active: '💬',
      error: '❌'
    };
    return emojis[estado || ''] || '📄';
  }
</script>

<!-- Button con GestureButton base -->
<div
  class="menu-btn-wrapper"
  class:menu-btn-wrapper--selected={hasSelection}
  style:--gesture-btn-bg="hsl(25 95% 53% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(25 95% 53% / 0.25)"
  style:--gesture-btn-bg-active="hsl(25 95% 53% / 0.35)"
  style:--gesture-btn-border-focus="var(--color-warning, #f97316)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={true}
    ariaLabel="Gestión de menús"
    on:select={handleGestureSelect}
    on:add={handleGestureAdd}
    on:config={handleGestureConfig}
  />
  {#if hasSelection}
    <span class="menu-btn__indicator" />
  {/if}
</div>

<!-- Panel Selector -->
<FloatingPanel bind:open={selectorOpen}>
  <div class="selector-panel">
    <header class="selector-header">
      <span>🍽️</span>
      <h3>Menús</h3>
    </header>

    <div class="selector-body">
      {#if loading}
        <div class="loading">Cargando...</div>
      {:else if error}
        <div class="error">{error}</div>
      {:else if items.length === 0}
        <div class="empty">
          <span class="empty-icon">📭</span>
          <span>No hay menús</span>
          <button class="empty-action" on:click={() => { selectorOpen = false; addOpen = true; }}>
            Crear nuevo
          </button>
        </div>
      {:else}
        <div class="items-list">
          {#each items as item}
            <button
              class="item"
              class:selected={item.id === selectedMenuId}
              on:click={() => handleItemSelect(item)}
            >
              <span class="item-estado">{getEstadoEmoji(item.estado)}</span>
              <div class="item-info">
                <span class="item-title">{item.title}</span>
                {#if item.productosCount !== undefined}
                  <span class="item-meta">{item.productosCount} productos</span>
                {/if}
              </div>
              {#if item.id === selectedMenuId}
                <span class="item-check">✓</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <footer class="selector-footer">
      <button class="footer-btn" on:click={() => { selectorOpen = false; addOpen = true; }}>
        + Nuevo Menú
      </button>
    </footer>
  </div>
</FloatingPanel>

<!-- Panel Add -->
<MenuGeneratorAddPanel
  bind:open={addOpen}
  on:create={handleCreate}
/>

<!-- Panel Config -->
<MenuGeneratorConfigPanel
  bind:open={configOpen}
  menuId={selectedMenuId}
  conversationId={selectedConversationId}
  on:validate={handleValidate}
  on:export={handleExport}
  on:applyPos={handleApplyPos}
  on:delete={handleDelete}
/>

<style>
  .menu-btn-wrapper {
    position: relative;
    display: contents;
  }

  .menu-btn-wrapper--selected :global(.gesture-btn) {
    --gesture-btn-bg: hsl(25 95% 53% / 0.25);
    border-color: hsl(25 95% 53% / 0.3);
  }

  /* === SELECTION INDICATOR === */
  .menu-btn__indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: var(--color-warning, #f97316);
    border-radius: 50%;
    pointer-events: none;
  }

  /* === SELECTOR PANEL === */
  .selector-panel {
    width: min(320px, 90vw);
    background: var(--color-bg-card, #1a1d24);
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
  }

  .selector-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: linear-gradient(135deg, rgb(249 115 22 / 0.15), transparent);
    border-bottom: 1px solid var(--color-border, #374151);
  }

  .selector-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .selector-body {
    max-height: 300px;
    overflow-y: auto;
  }

  .loading,
  .error,
  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--color-text-muted, #9ca3af);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .empty-icon {
    font-size: 2rem;
  }

  .empty-action {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgb(249 115 22 / 0.2);
    border: none;
    border-radius: var(--radius-md, 8px);
    color: var(--color-warning, #f97316);
    cursor: pointer;
  }

  .items-list {
    display: flex;
    flex-direction: column;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--color-border, #374151);
    color: var(--color-text, #e5e7eb);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .item:hover {
    background: rgb(107 114 128 / 0.1);
  }

  .item.selected {
    background: rgb(249 115 22 / 0.1);
  }

  .item-estado {
    font-size: 1.25rem;
  }

  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .item-title {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .item-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .item-check {
    color: var(--color-warning, #f97316);
    font-weight: bold;
  }

  .selector-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border, #374151);
  }

  .footer-btn {
    width: 100%;
    padding: 0.625rem;
    background: rgb(249 115 22 / 0.15);
    border: 1px dashed rgb(249 115 22 / 0.4);
    border-radius: var(--radius-md, 8px);
    color: var(--color-warning, #f97316);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .footer-btn:hover {
    background: rgb(249 115 22 / 0.25);
    border-style: solid;
  }
</style>
