<script lang="ts">
  /**
   * PedidoCard — Tarjeta de pedido en pantalla cocina
   *
   * Muestra: referencia (MESA 5, LLEVAR #3), timer en vivo, items con estado
   * Tap en header = marcar todo listo (atajo rápido)
   * Tap en item = toggle estado
   *
   * Colores borde:
   *   - Todos pendientes: slate-700
   *   - Alguno preparando: yellow-500
   *   - Todos listos: green-500 → fade out 3s
   *   - Timer >10min: red-500 pulse
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { PedidoCocina } from '$lib/stores/cocina';
  import { extractRef, elapsed, prepararItem, marcarListo } from '$lib/stores/cocina';

  import ItemLine from './ItemLine.svelte';

  export let pedido: PedidoCocina;

  const dispatch = createEventDispatcher();

  let elapsedTime = '00:00';
  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  });

  onDestroy(() => {
    clearInterval(timerInterval);
  });

  function updateTimer() {
    elapsedTime = elapsed(pedido.recibido_at);
  }

  $: ref = extractRef(pedido.cuenta_id);
  $: isListo = pedido.estado === 'listo';
  $: hasPreparando = pedido.items.some(i => i.estado === 'preparando');
  $: allPendiente = pedido.items.every(i => i.estado === 'pendiente');
  $: itemsListos = pedido.items.filter(i => i.estado === 'listo').length;
  $: itemsTotal = pedido.items.length;
  $: progress = itemsTotal > 0 ? itemsListos / itemsTotal : 0;

  // Timer warning: >10 minutos
  $: elapsedSeconds = (Date.now() - new Date(pedido.recibido_at).getTime()) / 1000;
  $: isUrgent = elapsedSeconds > 600 && !isListo;

  $: borderColor = isListo
    ? '#22c55e'
    : hasPreparando
      ? '#eab308'
      : isUrgent
        ? '#ef4444'
        : '#334155';

  function handleMarkReady() {
    marcarListo(pedido.pedido_id);
  }

  function handleItemTap(e: CustomEvent<{ item_id: string }>) {
    prepararItem(e.detail.item_id);
  }
</script>

<article
  class="pedido-card"
  class:listo={isListo}
  class:urgent={isUrgent}
  class:new-order={allPendiente && elapsedSeconds < 5}
  style="--border-color: {borderColor}"
>
  <!-- Header: ref + timer + progress -->
  <button class="card-header" on:click={handleMarkReady} title="Marcar todo listo">
    <div class="header-left">
      <span class="ref">{ref}</span>
      {#if pedido.canal}
        <span class="canal">{pedido.canal}</span>
      {/if}
    </div>
    <div class="header-right">
      <span class="progress-text">{itemsListos}/{itemsTotal}</span>
      <span class="timer" class:timer-urgent={isUrgent}>{elapsedTime}</span>
    </div>
  </button>

  <!-- Progress bar -->
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress * 100}%"></div>
  </div>

  <!-- Items -->
  <div class="card-items">
    {#each pedido.items as item (item.item_id)}
      <ItemLine {item} on:tap={handleItemTap} />
    {/each}
  </div>

  <!-- Notas generales -->
  {#if pedido.notas_generales}
    <div class="card-notas">
      {pedido.notas_generales}
    </div>
  {/if}
</article>

<style>
  .pedido-card {
    display: flex;
    flex-direction: column;
    background: #1e293b;
    border: 2px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    transition: opacity 0.5s, transform 0.5s, border-color 0.3s;
  }

  .pedido-card.listo {
    opacity: 0.3;
    transform: scale(0.96);
  }

  .pedido-card.urgent {
    animation: urgent-pulse 2s ease-in-out infinite;
  }

  .pedido-card.new-order {
    animation: flash-in 0.5s ease-out;
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #0f172a;
    border: none;
    border-bottom: 1px solid #334155;
    color: #f8fafc;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    min-height: 56px;
  }

  .card-header:active {
    background: #166534;
  }

  .header-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .ref {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 1px;
  }

  .canal {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .progress-text {
    font-size: 1rem;
    color: #64748b;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .timer {
    font-size: 1.2rem;
    font-weight: 700;
    color: #94a3b8;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-variant-numeric: tabular-nums;
  }

  .timer-urgent {
    color: #ef4444;
    animation: blink 1s ease-in-out infinite;
  }

  /* Progress bar */
  .progress-bar {
    height: 3px;
    background: #0f172a;
  }

  .progress-fill {
    height: 100%;
    background: #22c55e;
    transition: width 0.3s ease;
  }

  /* Items */
  .card-items {
    display: flex;
    flex-direction: column;
  }

  /* Notas */
  .card-notas {
    padding: 8px 16px 10px;
    font-size: 1rem;
    color: #fbbf24;
    font-weight: 600;
    border-top: 1px solid #334155;
    background: rgba(234, 179, 8, 0.05);
  }

  /* Animations */
  @keyframes urgent-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.2); }
    50% { box-shadow: 0 0 24px rgba(239, 68, 68, 0.5); }
  }

  @keyframes flash-in {
    0% { background: #1e40af; transform: scale(1.02); }
    100% { background: #1e293b; transform: scale(1); }
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
