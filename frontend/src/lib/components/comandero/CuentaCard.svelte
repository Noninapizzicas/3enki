<script lang="ts">
  /**
   * CuentaCard — Tarjeta de cuenta activa
   *
   * Zonas de doble pulsación:
   *   Izquierda → abre comandero (pedidos)
   *   Derecha   → abre cuenta (pagos/detalle)
   *
   * Color = tipo de cuenta
   * Máxima información visual: nombre, hora, items, total, estado, alertas
   */
  import { createEventDispatcher } from 'svelte';
  import type { Cuenta, TipoCuenta } from '$lib/stores/cuentas';
  import { TIPO_COLORS, TIPO_ICONS } from '$lib/stores/cuentas';

  export let cuenta: Cuenta;

  const dispatch = createEventDispatcher<{
    'open-comandero': { cuenta_id: string };
    'open-cuenta': { cuenta_id: string };
  }>();

  $: color = TIPO_COLORS[cuenta.tipo];
  $: icon = TIPO_ICONS[cuenta.tipo];
  $: isGlovo = cuenta.tipo === 'glovo';
  $: glovoListo = isGlovo && cuenta.estado === 'listo';

  const ESTADO_CONFIG: Record<string, { label: string; color: string; urgent: boolean }> = {
    pendiente:       { label: 'Pendiente',   color: '#64748b', urgent: false },
    con_pedido:      { label: 'Con pedido',  color: '#3b82f6', urgent: false },
    en_preparacion:  { label: 'Preparando',  color: '#eab308', urgent: false },
    listo:           { label: 'Listo',       color: '#22c55e', urgent: true },
    para_cobrar:     { label: 'Para cobrar', color: '#a855f7', urgent: true },
    cobrado:         { label: 'Cobrado',     color: '#6b7280', urgent: false }
  };

  $: estadoCfg = ESTADO_CONFIG[cuenta.estado] || { label: cuenta.estado, color: '#64748b', urgent: false };
  $: estadoLabel = estadoCfg.label;
  $: estadoColor = estadoCfg.color;
  $: estadoUrgent = estadoCfg.urgent;

  function handleLeftTap() {
    dispatch('open-comandero', { cuenta_id: cuenta.id });
  }

  function handleRightTap() {
    dispatch('open-cuenta', { cuenta_id: cuenta.id });
  }

  function formatTotal(total: number): string {
    return total.toFixed(2) + ' €';
  }
</script>

<div
  class="cuenta-card"
  class:alerta={cuenta.alerta}
  class:cobrado={cuenta.estado === 'cobrado'}
  class:glovo={isGlovo}
  class:glovo-listo={glovoListo}
  style="--card-color: {color}"
>
  <!-- Header: tipo icon + nombre + hora -->
  <div class="card-header">
    {#if isGlovo}
      <span class="glovo-badge">GLOVO</span>
    {:else}
      <span class="tipo-icon">{icon}</span>
    {/if}
    <span class="nombre">{cuenta.nombre}</span>
    <span class="hora">{cuenta.hora}</span>
  </div>

  <!-- Tap zones -->
  <div class="tap-zones">
    <button class="zone zone-left" on:click={handleLeftTap} title="Abrir comandero">
      <div class="zone-content">
        {#if cuenta.items > 0}
          <span class="items-count">{cuenta.items}</span>
          <span class="items-label">items</span>
        {:else}
          <span class="empty-label">Pedir</span>
        {/if}
      </div>
    </button>

    <div class="divider"></div>

    <button class="zone zone-right" on:click={handleRightTap} title="Abrir cuenta / cobrar">
      <div class="zone-content">
        {#if cuenta.total > 0}
          <span class="total">{formatTotal(cuenta.total)}</span>
        {:else}
          <span class="empty-label">0 €</span>
        {/if}
      </div>
    </button>
  </div>

  <!-- Footer: estado dot + label + alerta -->
  <div class="card-footer">
    <div class="estado-row">
      <span class="estado-dot" style="background: {estadoColor}"></span>
      <span class="estado" class:urgent={estadoUrgent}>
        {estadoLabel}
      </span>
    </div>
    {#if cuenta.alerta}
      <span class="alerta-badge" title="Requiere atención">!</span>
    {/if}
  </div>
</div>

<style>
  .cuenta-card {
    display: flex;
    flex-direction: column;
    border: 2px solid var(--card-color);
    border-radius: 12px;
    background: color-mix(in srgb, var(--card-color) 5%, #111);
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.1s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .cuenta-card.alerta {
    animation: alert-pulse 2s ease-in-out infinite;
    box-shadow: 0 0 12px color-mix(in srgb, var(--card-color) 40%, transparent);
  }

  .cuenta-card.cobrado {
    opacity: 0.5;
    border-style: dashed;
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--card-color) 15%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--card-color) 20%, transparent);
  }

  .tipo-icon {
    font-size: 0.9rem;
    line-height: 1;
  }

  .nombre {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hora {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }

  /* Tap zones */
  .tap-zones {
    display: flex;
    flex: 1;
    min-height: 64px;
  }

  .zone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #e0e0e0;
    cursor: pointer;
    padding: 8px;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .zone:active {
    background: color-mix(in srgb, var(--card-color) 20%, transparent);
  }

  .zone-left {
    border-right: 1px solid color-mix(in srgb, var(--card-color) 15%, transparent);
  }

  .divider {
    display: none;
  }

  .zone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .items-count {
    font-size: 1.4rem;
    font-weight: 800;
    line-height: 1;
    color: var(--card-color);
  }

  .items-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.5px;
  }

  .total {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .empty-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
  }

  /* Footer */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px 6px;
    border-top: 1px solid color-mix(in srgb, var(--card-color) 10%, transparent);
  }

  .estado-row {
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

  .estado {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
  }

  .estado.urgent {
    color: var(--card-color);
    font-weight: 700;
    animation: blink-soft 1.5s ease-in-out infinite;
  }

  .alerta-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ef4444;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 800;
  }

  /* ===== GLOVO STYLES ===== */

  .glovo-badge {
    display: inline-block;
    background: #FF6B00;
    color: #fff;
    font-size: 0.55rem;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 3px;
    letter-spacing: 1.5px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .cuenta-card.glovo .card-header {
    border-bottom-color: color-mix(in srgb, #FF6B00 30%, transparent);
  }

  .cuenta-card.glovo-listo {
    animation: glovo-listo-pulse 1.5s ease-in-out infinite;
  }

  /* Animations */
  @keyframes alert-pulse {
    0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--card-color) 20%, transparent); }
    50% { box-shadow: 0 0 20px color-mix(in srgb, var(--card-color) 50%, transparent); }
  }

  @keyframes glovo-listo-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(255, 107, 0, 0.3); }
    50% { box-shadow: 0 0 24px rgba(255, 107, 0, 0.7); }
  }

  @keyframes blink-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
