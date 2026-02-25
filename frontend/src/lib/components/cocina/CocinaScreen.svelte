<script lang="ts">
  /**
   * CocinaScreen — Pantalla principal de cocina
   *
   * Fullscreen, dark, high contrast.
   * Diseñada para ESP32-P4 (800x1280 portrait) o tablet Android.
   *
   * Layout:
   * ┌─────────────────────────────────────┐
   * │ Header (80px) — métricas + reloj    │
   * ├─────────────────────────────────────┤
   * │                                     │
   * │  Grid de PedidoCards                │
   * │  1 col (portrait) / 2 cols (land)   │
   * │                                     │
   * │  o estado vacío                     │
   * │                                     │
   * └─────────────────────────────────────┘
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import {
    pedidosCocina,
    cocinaLoading,
    pedidosCount,
    initCocinaSubscriptions,
    resumeAudioContext
  } from '$lib/stores/cocina';

  import CocinaHeader from './CocinaHeader.svelte';
  import PedidoCard from './PedidoCard.svelte';

  let cleanupSubs: (() => void) | null = null;
  let audioUnlocked = false;

  function unlockAudio() {
    if (!audioUnlocked) {
      resumeAudioContext();
      audioUnlocked = true;
    }
  }

  onMount(() => {
    connect().then(() => {
      cleanupSubs = initCocinaSubscriptions();
    }).catch((err) => {
      console.error('[CocinaScreen] MQTT connection failed', err);
    });

    setupVisibilityHandler();

    // Prevenir scroll bounce en iOS/ESP32 WebView
    document.body.style.overflow = 'hidden';

    // Desbloquear audio con cualquier interacción
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
  });

  onDestroy(() => {
    cleanupSubs?.();
    disconnect();
    removeVisibilityHandler();
    document.body.style.overflow = '';
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
  });
</script>

<svelte:head>
  <title>Cocina</title>
  <meta name="theme-color" content="#0f172a" />
</svelte:head>

<div class="cocina-screen">
  <CocinaHeader />

  <main class="cocina-grid-area">
    {#if $cocinaLoading && $pedidosCount === 0}
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Conectando con cocina</p>
      </div>
    {:else if $pedidosCount === 0}
      <div class="empty-state">
        <span class="empty-icon">&#10003;</span>
        <p class="empty-title">Sin pedidos</p>
        <p class="empty-hint">Los pedidos aparecen cuando se envían desde el comandero</p>
      </div>
    {:else}
      <div class="pedidos-grid">
        {#each $pedidosCocina as pedido (pedido.pedido_id)}
          <PedidoCard {pedido} />
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  .cocina-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0f172a;
    color: #f8fafc;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .cocina-grid-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px;
    scroll-behavior: smooth;
  }

  /* Scrollbar dark theme */
  .cocina-grid-area::-webkit-scrollbar {
    width: 6px;
  }
  .cocina-grid-area::-webkit-scrollbar-track {
    background: #0f172a;
  }
  .cocina-grid-area::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 3px;
  }

  .pedidos-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    align-content: start;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    text-align: center;
  }

  .empty-icon {
    font-size: 4rem;
    line-height: 1;
    color: #334155;
  }

  .empty-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #475569;
  }

  .empty-state p {
    margin: 0;
  }

  .empty-hint {
    font-size: 0.9rem;
    color: #334155;
  }

  /* Landscape: 2 columns */
  @media (orientation: landscape) {
    .pedidos-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Wide desktop: up to 3 columns */
  @media (min-width: 1400px) {
    .pedidos-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* Small portrait (ESP32 800px): adjust spacing */
  @media (max-width: 800px) and (orientation: portrait) {
    .cocina-grid-area {
      padding: 10px;
    }

    .pedidos-grid {
      gap: 10px;
    }
  }
</style>
