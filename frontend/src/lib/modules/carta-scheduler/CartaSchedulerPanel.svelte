<script lang="ts">
  /**
   * Panel router de carta-scheduler.
   * Tabs activeView 'reglas' | 'pendientes' (D1). ConflictosBanner arriba si hay
   * conflictos detectados (D3). 1 boton work-bar para el modulo entero (D2).
   */
  import { onMount, onDestroy } from 'svelte';
  import ReglasView from './ReglasView.svelte';
  import PendientesView from './PendientesView.svelte';
  import ConflictosBanner from './ConflictosBanner.svelte';
  import {
    loadReglas,
    loadPendientes,
    initCartaSchedulerSubscriptions,
    conflictosDetectados,
    cartaSchedulerError
  } from '$lib/stores/carta-scheduler';

  let activeView: 'reglas' | 'pendientes' = 'reglas';
  let cleanupSubs: (() => void) | null = null;

  onMount(() => {
    loadReglas();
    loadPendientes();
    cleanupSubs = initCartaSchedulerSubscriptions();
  });

  onDestroy(() => {
    if (cleanupSubs) cleanupSubs();
  });
</script>

<div class="carta-scheduler-panel">
  {#if $cartaSchedulerError}
    <div class="error-banner">{$cartaSchedulerError}</div>
  {/if}

  {#if $conflictosDetectados.length > 0}
    <ConflictosBanner conflictos={$conflictosDetectados} />
  {/if}

  <nav class="tabs">
    <button class:active={activeView === 'reglas'} on:click={() => (activeView = 'reglas')}>
      Reglas
    </button>
    <button class:active={activeView === 'pendientes'} on:click={() => (activeView = 'pendientes')}>
      Pendientes
    </button>
  </nav>

  {#if activeView === 'reglas'}
    <ReglasView />
  {:else if activeView === 'pendientes'}
    <PendientesView />
  {/if}
</div>

<style>
  .carta-scheduler-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }
  .error-banner {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.15));
  }
  .tabs button {
    background: none;
    border: none;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    border-bottom: 2px solid transparent;
  }
  .tabs button.active {
    color: var(--text-primary, rgba(228, 228, 231, 1));
    border-bottom-color: var(--accent, rgb(129, 140, 248));
    font-weight: 600;
  }
</style>
