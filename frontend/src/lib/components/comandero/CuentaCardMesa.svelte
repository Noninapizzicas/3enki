<script lang="ts">
  /**
   * CuentaCardMesa — Tarjeta Boceto B
   *
   * Header: emoji_tipo + nombre + emoji_pago + hora + countdown
   * Split tap zones: izquierda → comandero | derecha → cobro
   * Items: dot estado cocina + nombre truncado + xN
   * Barra progreso cocina: ■■■□
   * Footer: estado + "PEDIDO FUERA!" + acciones
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Cuenta, ItemDetalle } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS, deleteCuenta, marcarEntregado } from '$lib/stores/cuentas';

  export let cuenta: Cuenta;
  export let projectId: string = '';
  export let categoriasMap: Record<string, string> = {};

  const dispatch = createEventDispatcher<{
    'open-comandero': { cuenta_id: string };
    'open-cuenta': { cuenta_id: string };
  }>();

  $: color = TIPO_COLORS[cuenta.tipo] || '#3b82f6';
  $: icon = TIPO_ICONS[cuenta.tipo] || '\uD83C\uDFE0';

  // CANAL elegido por el cliente (mesa | recoger | llevar). El `tipo` coarse del store
  // colapsa recoger\u2192local, as\u00ED que el modo se muestra aparte con su propio icono.
  const MODO_ICONS: Record<string, string> = {
    mesa: '\uD83C\uDF7D', recoger: '\uD83D\uDECD', llevar: '\uD83E\uDD61'
  };
  $: modoIcon = cuenta.modo_consumo ? (MODO_ICONS[cuenta.modo_consumo] || '') : '';
  $: isGlovo = cuenta.tipo === 'glovo';
  $: isLlevadoo = cuenta.tipo === 'llevadoo';
  $: glovoListo = isGlovo && cuenta.estado === 'listo';

  // ===== TIMERS =====
  let elapsedStr = '00:00';
  let countdownStr = '';
  let countdownUrgent = false;
  let timerInterval: ReturnType<typeof setInterval>;

  function updateTimers() {
    if (cuenta.created_at) {
      const diff = Math.floor((Date.now() - new Date(cuenta.created_at).getTime()) / 1000);
      if (diff >= 0) {
        const hrs = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        elapsedStr = hrs > 0
          ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }

    let recogidaMs: number | null = null;
    if (cuenta.hora_recogida) {
      const parsed = new Date(cuenta.hora_recogida);
      if (!isNaN(parsed.getTime())) {
        recogidaMs = parsed.getTime();
      } else {
        const match = cuenta.hora_recogida.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
          const today = new Date();
          today.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
          recogidaMs = today.getTime();
        }
      }
    } else if (cuenta.tiempo_estimado && cuenta.created_at) {
      recogidaMs = new Date(cuenta.created_at).getTime() + cuenta.tiempo_estimado * 60 * 1000;
    }

    if (recogidaMs) {
      const remaining = Math.floor((recogidaMs - Date.now()) / 1000);
      if (remaining > 0) {
        const rMins = Math.floor(remaining / 60);
        const rSecs = remaining % 60;
        countdownStr = `-${String(rMins).padStart(2, '0')}:${String(rSecs).padStart(2, '0')}`;
        countdownUrgent = rMins < 3;
      } else {
        const overSecs = Math.abs(remaining);
        const oMins = Math.floor(overSecs / 60);
        const oSecs = overSecs % 60;
        countdownStr = `+${String(oMins).padStart(2, '0')}:${String(oSecs).padStart(2, '0')}`;
        countdownUrgent = true;
      }
    } else {
      countdownStr = '';
      countdownUrgent = false;
    }
  }

  onMount(() => {
    updateTimers();
    timerInterval = setInterval(updateTimers, 1000);
  });

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  // ===== ITEMS =====
  $: items = cuenta.itemsDetalle || [];
  $: totalItems = items.length;
  $: listoCount = items.filter(i => i.estado_cocina === 'listo').length;
  $: preparandoCount = items.filter(i => i.estado_cocina === 'preparando').length;
  $: allListo = totalItems > 0 && listoCount === totalItems;
  $: pedidoFuera = allListo || cuenta.estado === 'listo';

  $: avisoCount = items.filter(i => {
    if (i.estado_cocina !== 'listo' || !i.listo_at) return false;
    return (Date.now() - new Date(i.listo_at).getTime()) < 60000;
  }).length;

  // Acción principal: botón entregar grande
  // Llevadoo: visible desde en_preparacion (no pasa por cobro)
  // Resto: visible cuando pedido listo, entregado o cobrado
  $: showEntregarAction = isLlevadoo
    ? ['en_preparacion', 'para_recoger', 'listo'].includes(cuenta.estado)
    : ['listo', 'entregado', 'para_cobrar', 'cobrado'].includes(cuenta.estado);
  // Pendiente sin items = se puede borrar
  $: showDeleteBtn = cuenta.estado === 'pendiente' && cuenta.items === 0;

  async function handleEntregarAction() {
    if (cuenta.pagado || cuenta.tipo === 'llevadoo') {
      // Pagado o llevadoo (pago externo) → marcar entregado directamente
      await marcarEntregado(projectId, cuenta.id);
    } else {
      // No pagado → abrir cobros
      handleRightTap();
    }
  }

  const ESTADO_CONFIG: Record<string, { label: string; color: string; urgent: boolean }> = {
    pendiente:       { label: 'Pendiente',     color: '#64748b', urgent: false },
    con_pedido:      { label: 'En cocina',     color: '#3b82f6', urgent: false },
    en_preparacion:  { label: 'Preparando',    color: '#eab308', urgent: false },
    listo:           { label: 'PEDIDO FUERA!', color: '#22c55e', urgent: true },
    entregado:       { label: 'Entregado',     color: '#a855f7', urgent: false },
    para_cobrar:     { label: 'Para cobrar',   color: '#f59e0b', urgent: true },
    cobrado:         { label: 'Cobrado',       color: '#6b7280', urgent: false }
  };

  $: estadoCfg = ESTADO_CONFIG[cuenta.estado] || { label: cuenta.estado, color: '#64748b', urgent: false };

  function handleLeftTap() {
    dispatch('open-comandero', { cuenta_id: cuenta.id });
  }

  function handleRightTap() {
    dispatch('open-cuenta', { cuenta_id: cuenta.id });
  }

  async function handleDelete() {
    if (!projectId) return;
    await deleteCuenta(projectId, cuenta.id);
  }

  function formatTotal(total: number): string {
    return total.toFixed(2) + ' \u20AC';
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
  class:pedido-fuera={pedidoFuera}
  class:glovo-listo={glovoListo}
  style="--card-color: {color}"
>
  <!-- Header: emoji_tipo + pago + nombre + hora + countdown -->
  <div class="card-header">
    {#if isGlovo}
      <span class="glovo-badge">GLOVO</span>
    {:else}
      <span class="tipo-icon">{icon}</span>
    {/if}
    {#if modoIcon}
      <span class="modo-badge" title={cuenta.modo_consumo}>{modoIcon}</span>
    {/if}
    {#if !isLlevadoo}
      <span class="pago-pill" class:pagado={cuenta.pagado}>
        {cuenta.pagado ? '\uD83D\uDCB0' : '\u274C'}
      </span>
    {/if}
    <span class="nombre">{cuenta.nombre}</span>
    <span class="hora">{cuenta.hora}</span>
    {#if countdownStr}
      <span class="countdown" class:countdown-urgent={countdownUrgent}>{countdownStr}</span>
    {/if}
  </div>

  <!-- Progress bar cocina -->
  {#if totalItems > 0}
    <div class="progress-bar">
      {#each items as item}
        <span
          class="progress-block"
          class:block-cocina={item.estado_cocina === 'en_cocina'}
          class:block-preparando={item.estado_cocina === 'preparando'}
          class:block-listo={item.estado_cocina === 'listo'}
        ></span>
      {/each}
      <span class="progress-count">{listoCount}/{totalItems}</span>
    </div>
  {/if}

  <!-- Split tap zones -->
  <div class="tap-zones">
    <!-- LEFT: items → comandero -->
    <button class="zone zone-left" on:click={handleLeftTap}>
      {#if totalItems > 0}
        <div class="items-list">
          {#each items as item}
            <div
              class="item-row"
              class:item-preparando={item.estado_cocina === 'preparando'}
              class:item-listo={item.estado_cocina === 'listo'}
              class:item-aviso={isRecienListo(item)}
            >
              <span
                class="item-dot"
                class:dot-cocina={item.estado_cocina === 'en_cocina'}
                class:dot-preparando={item.estado_cocina === 'preparando'}
                class:dot-listo={item.estado_cocina === 'listo'}
              ></span>
              <span class="item-nombre">{item.nombre}</span>
              <span class="item-qty">x{item.cantidad}</span>
            </div>
          {/each}
        </div>
      {:else if cuenta.items > 0}
        <div class="zone-center">
          <span class="items-count">{cuenta.items}</span>
        </div>
      {:else}
        <div class="zone-center">
          <span class="empty-label">PEDIR</span>
        </div>
      {/if}
    </button>

    <!-- DIVIDER -->
    <div class="zone-divider"></div>

    <!-- RIGHT: total → cobro -->
    <button class="zone zone-right" on:click={handleRightTap}>
      <div class="zone-center">
        <span class="total">{formatTotal(cuenta.total)}</span>
        <span class="elapsed">{elapsedStr}</span>
      </div>
    </button>
  </div>

  <!-- Footer: estado + acción entregar -->
  <div class="card-footer">
    <div class="footer-info">
      <span class="estado-dot" style="background: {estadoCfg.color}"></span>
      <span class="estado-label" class:urgent={estadoCfg.urgent}>{estadoCfg.label}</span>
      {#if avisoCount > 0}
        <span class="aviso-badge">{avisoCount}!</span>
      {/if}
    </div>
    <div class="footer-actions">
      {#if showEntregarAction}
        <button
          class="entregar-btn"
          class:entregar-cobrar={!isLlevadoo && !cuenta.pagado}
          class:entregar-cerrar={!isLlevadoo && cuenta.pagado}
          class:entregar-llevadoo={isLlevadoo}
          on:click|stopPropagation={handleEntregarAction}
          title={isLlevadoo ? 'Entregar al repartidor' : cuenta.pagado ? 'Cerrar cuenta' : 'Cobrar primero'}
        >
          {isLlevadoo ? '\uD83D\uDEF5' : cuenta.pagado ? '\u2705' : '\uD83D\uDCB0'}
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

  .card-mesa.pedido-fuera {
    box-shadow: 0 0 16px color-mix(in srgb, var(--card-color) 50%, transparent);
  }

  /* ===== HEADER ===== */
  .card-header {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    background: color-mix(in srgb, var(--card-color) 15%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--card-color) 20%, transparent);
    overflow: hidden;
  }

  .tipo-icon {
    font-size: 0.85rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .modo-badge {
    font-size: 0.8rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .glovo-badge {
    display: inline-block;
    background: #FF6B00;
    color: #fff;
    font-size: 0.5rem;
    font-weight: 900;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 1px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .nombre {
    flex: 1;
    font-size: 0.8rem;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .pago-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 0.8rem;
    line-height: 1;
    flex-shrink: 0;
    background: rgba(239, 68, 68, 0.25);
    border: 1.5px solid #ef4444;
  }

  .pago-pill.pagado {
    background: rgba(34, 197, 94, 0.25);
    border-color: #22c55e;
  }

  .hora {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.4);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .countdown {
    font-size: 0.6rem;
    font-weight: 700;
    color: #22c55e;
    font-variant-numeric: tabular-nums;
    font-family: 'SF Mono', 'Menlo', monospace;
    flex-shrink: 0;
  }

  .countdown.countdown-urgent {
    color: #ef4444;
    animation: blink-soft 1s ease-in-out infinite;
  }

  /* ===== PROGRESS BAR ===== */
  .progress-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid color-mix(in srgb, var(--card-color) 10%, transparent);
  }

  .progress-block {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: #333;
    transition: background 0.3s;
  }

  .progress-block.block-cocina {
    background: #475569;
  }

  .progress-block.block-preparando {
    background: #eab308;
    animation: preparando-pulse 1.2s ease-in-out infinite;
  }

  .progress-block.block-listo {
    background: #22c55e;
  }

  .progress-count {
    font-size: 0.55rem;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin-left: 4px;
    flex-shrink: 0;
  }

  /* ===== TAP ZONES ===== */
  .tap-zones {
    display: flex;
    flex: 1;
    min-height: 56px;
  }

  .zone {
    display: flex;
    align-items: stretch;
    border: none;
    background: transparent;
    color: #e0e0e0;
    cursor: pointer;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.1s;
  }

  .zone:active {
    background: color-mix(in srgb, var(--card-color) 15%, transparent);
  }

  .zone-left {
    flex: 1;
    min-width: 0;
  }

  .zone-divider {
    width: 1px;
    background: color-mix(in srgb, var(--card-color) 20%, transparent);
    flex-shrink: 0;
  }

  .zone-right {
    width: 80px;
    flex-shrink: 0;
    justify-content: center;
  }

  .zone-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 2px;
    padding: 6px;
  }

  /* Items list in left zone */
  .items-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 4px 8px;
    max-height: 160px;
    overflow-y: auto;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 1px 0;
  }

  .item-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .item-dot.dot-cocina {
    background: #475569;
  }

  .item-dot.dot-preparando {
    background: #eab308;
    animation: preparando-pulse 1.2s ease-in-out infinite;
    box-shadow: 0 0 4px rgba(234, 179, 8, 0.5);
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
    font-size: 0.7rem;
    color: #d0d0d0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    text-align: left;
  }

  .item-row.item-preparando .item-nombre {
    color: #eab308;
  }

  .item-row.item-listo .item-nombre {
    color: #22c55e;
  }

  .item-row.item-aviso .item-nombre {
    color: #22c55e;
    font-weight: 700;
  }

  .item-qty {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.4);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  /* Zone center content */
  .items-count {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--card-color);
    line-height: 1;
  }

  .empty-label {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .total {
    font-size: 1rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .elapsed {
    font-size: 0.55rem;
    color: rgba(255, 255, 255, 0.35);
    font-variant-numeric: tabular-nums;
    font-family: 'SF Mono', 'Menlo', monospace;
  }

  /* ===== FOOTER ===== */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 5px;
    border-top: 1px solid color-mix(in srgb, var(--card-color) 10%, transparent);
  }

  .footer-info {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .estado-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .estado-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }

  .estado-label.urgent {
    color: var(--card-color);
    font-weight: 800;
    animation: blink-soft 1.5s ease-in-out infinite;
  }

  .aviso-badge {
    font-size: 0.5rem;
    font-weight: 800;
    background: #22c55e;
    color: #000;
    padding: 0px 5px;
    border-radius: 8px;
    animation: aviso-pulse 1s ease-in-out infinite;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Botón entregar grande emoji */
  .entregar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid;
    font-size: 1.2rem;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.2s;
    -webkit-tap-highlight-color: transparent;
    background: transparent;
  }

  .entregar-btn:active {
    transform: scale(0.9);
  }

  .entregar-cobrar {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
    animation: blink-soft 1.5s ease-in-out infinite;
  }

  .entregar-cerrar {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
  }

  .entregar-llevadoo {
    border-color: #a855f7;
    background: rgba(168, 85, 247, 0.2);
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
    animation: blink-soft 1.5s ease-in-out infinite;
  }

  /* Delete para cuentas vacías */
  .action-btn {
    border: none;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.55rem;
    font-weight: 800;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn:active {
    opacity: 0.7;
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

  @keyframes preparando-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(234, 179, 8, 0.5); }
    50% { opacity: 0.5; box-shadow: 0 0 8px rgba(234, 179, 8, 0.8); }
  }

  @keyframes aviso-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes glovo-listo-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(255, 107, 0, 0.3); }
    50% { box-shadow: 0 0 24px rgba(255, 107, 0, 0.7); }
  }

  .card-mesa.glovo-listo {
    animation: glovo-listo-pulse 1.5s ease-in-out infinite;
  }

  @keyframes blink-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* ===== MOBILE ===== */
  @media (max-width: 600px) {
    .card-mesa { border-radius: 8px; border-width: 1.5px; }
    .card-header { padding: 4px 6px; gap: 4px; }
    .tipo-icon { font-size: 0.75rem; }
    .nombre { font-size: 0.7rem; }
    .pago-pill { width: 18px; height: 18px; font-size: 0.65rem; border-width: 1px; }
    .hora { font-size: 0.5rem; }
    .countdown { font-size: 0.5rem; }
    .progress-bar { padding: 2px 6px; gap: 1px; }
    .progress-block { height: 3px; }
    .progress-count { font-size: 0.5rem; }
    .tap-zones { min-height: 44px; }
    .zone-right { width: 68px; }
    .items-list { padding: 3px 6px; max-height: 120px; }
    .item-dot { width: 5px; height: 5px; }
    .item-nombre { font-size: 0.6rem; }
    .item-qty { font-size: 0.5rem; }
    .total { font-size: 0.85rem; }
    .elapsed { font-size: 0.5rem; }
    .card-footer { padding: 3px 6px 4px; }
    .estado-dot { width: 5px; height: 5px; }
    .estado-label { font-size: 0.5rem; }
    .entregar-btn { width: 30px; height: 30px; font-size: 1rem; }
    .action-btn { padding: 2px 6px; font-size: 0.5rem; }
    .glovo-badge { font-size: 0.45rem; padding: 1px 4px; }
  }
</style>
