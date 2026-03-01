<script lang="ts">
  /**
   * CuentaCardMesa — Tarjeta de cuenta para Mesa/Local
   *
   * Muestra items agrupados por categoría con estados de cocina:
   *   en_cocina → punto naranja (cocinando)
   *   listo     → punto verde + pulso (aviso: recoger!)
   *
   * Tap header → abre comandero (añadir pedidos)
   * Tap total  → abre cuenta (cobrar)
   */
  import { createEventDispatcher } from 'svelte';
  import type { Cuenta, ItemDetalle } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS, deleteCuenta } from '$lib/stores/cuentas';

  export let cuenta: Cuenta;
  export let projectId: string = '';
  /** Map de producto_id → nombre de categoría */
  export let categoriasMap: Record<string, string> = {};

  const dispatch = createEventDispatcher<{
    'open-comandero': { cuenta_id: string };
    'open-cuenta': { cuenta_id: string };
  }>();

  $: color = TIPO_COLORS[cuenta.tipo] || '#3b82f6';
  $: icon = TIPO_ICONS[cuenta.tipo] || '\uD83C\uDFE0';

  // Agrupar items por categoría
  interface ItemGroup {
    categoria: string;
    items: ItemDetalle[];
  }

  $: groupedItems = groupByCategoria(cuenta.itemsDetalle || []);

  function groupByCategoria(items: ItemDetalle[]): ItemGroup[] {
    const groups = new Map<string, ItemDetalle[]>();
    for (const item of items) {
      const cat = categoriasMap[item.producto_id] || 'Otros';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoria, items]) => ({ categoria, items }));
  }

  // Contar items con aviso (recién listo, <60s)
  $: avisoCount = (cuenta.itemsDetalle || []).filter(i => {
    if (i.estado_cocina !== 'listo' || !i.listo_at) return false;
    return (Date.now() - new Date(i.listo_at).getTime()) < 60000;
  }).length;

  $: listoCount = (cuenta.itemsDetalle || []).filter(i => i.estado_cocina === 'listo').length;
  $: totalItems = (cuenta.itemsDetalle || []).length;
  $: hasItems = totalItems > 0;

  // Acciones contextuales
  $: showCobrarBtn = cuenta.estado === 'listo' || cuenta.estado === 'entregado';
  $: showDeleteBtn = cuenta.estado === 'pendiente' || cuenta.estado === 'cobrado';

  const ESTADO_CONFIG: Record<string, { label: string; color: string; urgent: boolean }> = {
    pendiente:       { label: 'Pendiente',   color: '#64748b', urgent: false },
    con_pedido:      { label: 'Con pedido',  color: '#3b82f6', urgent: false },
    en_preparacion:  { label: 'En cocina',   color: '#eab308', urgent: false },
    listo:           { label: 'Listo',       color: '#22c55e', urgent: true },
    entregado:       { label: 'Entregado',   color: '#a855f7', urgent: false },
    para_cobrar:     { label: 'Para cobrar', color: '#f59e0b', urgent: true },
    cobrado:         { label: 'Cobrado',     color: '#6b7280', urgent: false }
  };

  $: estadoCfg = ESTADO_CONFIG[cuenta.estado] || { label: cuenta.estado, color: '#64748b', urgent: false };

  function handleOpenComandero() {
    dispatch('open-comandero', { cuenta_id: cuenta.id });
  }

  function handleOpenCuenta() {
    dispatch('open-cuenta', { cuenta_id: cuenta.id });
  }

  async function handleDelete() {
    if (!projectId) return;
    await deleteCuenta(projectId, cuenta.id);
  }

  function formatTotal(total: number): string {
    return total.toFixed(2) + ' €';
  }

  function isRecienListo(item: ItemDetalle): boolean {
    if (item.estado_cocina !== 'listo' || !item.listo_at) return false;
    return (Date.now() - new Date(item.listo_at).getTime()) < 60000;
  }
</script>

<div
  class="card-mesa"
  class:alerta={cuenta.alerta || avisoCount > 0}
  class:cobrado={cuenta.estado === 'cobrado'}
  style="--card-color: {color}"
>
  <!-- Header: icon + nombre + total -->
  <div class="card-header">
    <button class="header-tap" on:click={handleOpenComandero}>
      <span class="tipo-icon">{icon}</span>
      <span class="nombre">{cuenta.nombre}</span>
    </button>
    <button class="total-btn" on:click={handleOpenCuenta}>
      {formatTotal(cuenta.total)}
    </button>
  </div>

  <!-- Items body -->
  <div class="items-body" on:click={handleOpenComandero} role="button" tabindex="0" on:keydown={e => e.key === 'Enter' && handleOpenComandero()}>
    {#if hasItems}
      {#each groupedItems as group}
        <div class="category-group">
          <div class="category-label">{group.categoria}</div>
          {#each group.items as item}
            <div class="item-row" class:item-listo={item.estado_cocina === 'listo'} class:item-aviso={isRecienListo(item)}>
              <span
                class="item-dot"
                class:dot-cocina={item.estado_cocina === 'en_cocina'}
                class:dot-listo={item.estado_cocina === 'listo'}
              ></span>
              <span class="item-nombre">{item.nombre}</span>
              {#if item.cantidad > 1}
                <span class="item-cantidad">x{item.cantidad}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    {:else if cuenta.items > 0}
      <div class="items-summary">
        <span class="items-count">{cuenta.items}</span>
        <span class="items-label">items en buffer</span>
      </div>
    {:else}
      <div class="empty-state">
        <span class="empty-label">Pedir</span>
      </div>
    {/if}
  </div>

  <!-- Footer: estado + aviso + actions -->
  <div class="card-footer">
    <div class="footer-info">
      <span class="estado-dot" style="background: {estadoCfg.color}"></span>
      <span class="estado-label" class:urgent={estadoCfg.urgent}>{estadoCfg.label}</span>
      {#if avisoCount > 0}
        <span class="aviso-badge">{avisoCount} aviso{avisoCount > 1 ? 's' : ''}</span>
      {:else if listoCount > 0 && totalItems > 0}
        <span class="listo-info">{listoCount}/{totalItems}</span>
      {/if}
    </div>
    <div class="footer-actions">
      {#if showCobrarBtn}
        <button class="action-btn action-cobrar" on:click|stopPropagation={handleOpenCuenta}>
          COBRAR
        </button>
      {/if}
      {#if showDeleteBtn}
        <button class="action-btn action-delete" on:click|stopPropagation={handleDelete}>
          X
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .card-mesa {
    display: flex;
    flex-direction: column;
    border: 2px solid var(--card-color);
    border-radius: 12px;
    background: color-mix(in srgb, var(--card-color) 5%, #111);
    overflow: hidden;
    transition: box-shadow 0.2s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .card-mesa.alerta {
    animation: mesa-pulse 2s ease-in-out infinite;
    box-shadow: 0 0 12px color-mix(in srgb, var(--card-color) 40%, transparent);
  }

  .card-mesa.cobrado {
    opacity: 0.5;
    border-style: dashed;
  }

  /* ===== HEADER ===== */
  .card-header {
    display: flex;
    align-items: center;
    background: color-mix(in srgb, var(--card-color) 15%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--card-color) 20%, transparent);
  }

  .header-tap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: none;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    min-width: 0;
  }

  .header-tap:active {
    background: color-mix(in srgb, var(--card-color) 20%, transparent);
  }

  .tipo-icon {
    font-size: 0.9rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .nombre {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .total-btn {
    font-size: 0.85rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--card-color) 30%, transparent);
    border: none;
    padding: 8px 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.1s;
    flex-shrink: 0;
  }

  .total-btn:active {
    background: color-mix(in srgb, var(--card-color) 50%, transparent);
  }

  /* ===== ITEMS BODY ===== */
  .items-body {
    flex: 1;
    padding: 6px 10px;
    cursor: pointer;
    min-height: 48px;
    max-height: 200px;
    overflow-y: auto;
  }

  .category-group {
    margin-bottom: 4px;
  }

  .category-group:last-child {
    margin-bottom: 0;
  }

  .category-label {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.35);
    padding: 2px 0;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0 2px 8px;
  }

  .item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #475569;
  }

  .item-dot.dot-cocina {
    background: #eab308;
  }

  .item-dot.dot-listo {
    background: #22c55e;
  }

  .item-row.item-aviso .item-dot.dot-listo {
    animation: aviso-pulse 1s ease-in-out infinite;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
  }

  .item-nombre {
    flex: 1;
    font-size: 0.75rem;
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-row.item-listo .item-nombre {
    color: #22c55e;
  }

  .item-row.item-aviso .item-nombre {
    color: #22c55e;
    font-weight: 700;
  }

  .item-cantidad {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }

  /* Empty / summary states */
  .items-summary, .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 48px;
  }

  .items-count {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--card-color);
    line-height: 1;
  }

  .items-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
  }

  .empty-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
  }

  /* ===== FOOTER ===== */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px 6px;
    border-top: 1px solid color-mix(in srgb, var(--card-color) 10%, transparent);
  }

  .footer-info {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .estado-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .estado-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }

  .estado-label.urgent {
    color: var(--card-color);
    font-weight: 700;
    animation: blink-soft 1.5s ease-in-out infinite;
  }

  .aviso-badge {
    font-size: 0.55rem;
    font-weight: 800;
    background: #22c55e;
    color: #000;
    padding: 1px 6px;
    border-radius: 8px;
    animation: aviso-pulse 1s ease-in-out infinite;
  }

  .listo-info {
    font-size: 0.6rem;
    color: #22c55e;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .footer-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn:active {
    opacity: 0.7;
  }

  .action-cobrar {
    background: #22c55e;
    color: #fff;
  }

  .action-delete {
    background: transparent;
    border: 1px solid #ef4444;
    color: #ef4444;
  }

  /* ===== ANIMATIONS ===== */
  @keyframes mesa-pulse {
    0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--card-color) 20%, transparent); }
    50% { box-shadow: 0 0 20px color-mix(in srgb, var(--card-color) 50%, transparent); }
  }

  @keyframes aviso-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes blink-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* ===== MOBILE ===== */
  @media (max-width: 600px) {
    .card-mesa { border-radius: 8px; border-width: 1.5px; }
    .header-tap { padding: 4px 8px; gap: 4px; }
    .tipo-icon { font-size: 0.75rem; }
    .nombre { font-size: 0.7rem; }
    .total-btn { font-size: 0.7rem; padding: 4px 6px; }
    .items-body { padding: 4px 8px; min-height: 36px; max-height: 150px; }
    .category-label { font-size: 0.5rem; }
    .item-row { padding: 1px 0 1px 6px; gap: 4px; }
    .item-dot { width: 5px; height: 5px; }
    .item-nombre { font-size: 0.65rem; }
    .item-cantidad { font-size: 0.55rem; }
    .card-footer { padding: 3px 8px 4px; }
    .estado-dot { width: 5px; height: 5px; }
    .estado-label { font-size: 0.55rem; }
    .aviso-badge { font-size: 0.5rem; padding: 1px 4px; }
    .action-btn { padding: 3px 8px; font-size: 0.5rem; }
  }
</style>
