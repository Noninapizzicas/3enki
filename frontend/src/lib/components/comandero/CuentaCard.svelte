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

  $: estadoLabel = {
    pendiente: 'Pendiente',
    con_pedido: 'Con pedido',
    en_preparacion: 'Preparando',
    listo: 'Listo',
    para_cobrar: 'Para cobrar',
    cobrado: 'Cobrado'
  }[cuenta.estado] || cuenta.estado;

  $: estadoUrgent = cuenta.estado === 'listo' || cuenta.estado === 'para_cobrar';

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
  style="--card-color: {color}"
>
  <!-- Header: tipo icon + nombre + hora -->
  <div class="card-header">
    <span class="tipo-icon">{icon}</span>
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

  <!-- Footer: estado + alerta -->
  <div class="card-footer">
    <span class="estado" class:urgent={estadoUrgent}>
      {estadoLabel}
    </span>
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

  /* Animations */
  @keyframes alert-pulse {
    0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--card-color) 20%, transparent); }
    50% { box-shadow: 0 0 20px color-mix(in srgb, var(--card-color) 50%, transparent); }
  }

  @keyframes blink-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
