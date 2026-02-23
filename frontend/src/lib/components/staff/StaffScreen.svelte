<script lang="ts">
  /**
   * StaffScreen — Shell principal del módulo de personal
   *
   * Dos pestañas:
   *   · Fichajes  → FichajeBoard (quién está en turno ahora)
   *   · Empleados → EmpleadosList (gestión de empleados + NFC)
   *
   * Gestiona la conexión MQTT; los sub-componentes pueden asumir que hay conexión.
   */
  import { onMount, onDestroy } from 'svelte';
  import { connect, disconnect, setupVisibilityHandler, removeVisibilityHandler } from '$lib/ui-core';
  import { ConnectionStatus } from '$lib/components/base';
  import FichajeBoard  from './FichajeBoard.svelte';
  import EmpleadosList from './EmpleadosList.svelte';

  type Tab = 'fichajes' | 'empleados';
  let activeTab: Tab = 'fichajes';

  onMount(async () => {
    await connect();
    setupVisibilityHandler(connect, disconnect);
  });

  onDestroy(() => {
    removeVisibilityHandler();
    disconnect();
  });
</script>

<div class="screen">
  <!-- Barra de estado de conexión -->
  <ConnectionStatus />

  <!-- Tabs -->
  <nav class="tabs">
    <button
      class="tab"
      class:tab-active={activeTab === 'fichajes'}
      on:click={() => (activeTab = 'fichajes')}
    >
      Fichajes
    </button>
    <button
      class="tab"
      class:tab-active={activeTab === 'empleados'}
      on:click={() => (activeTab = 'empleados')}
    >
      Empleados
    </button>
  </nav>

  <!-- Contenido -->
  <main class="content">
    {#if activeTab === 'fichajes'}
      <FichajeBoard />
    {:else}
      <EmpleadosList />
    {/if}
  </main>
</div>

<style>
  .screen {
    min-height: 100dvh;
    background: #0a0a0a;
    display: flex;
    flex-direction: column;
  }

  /* ── Tabs ── */
  .tabs {
    display: flex;
    border-bottom: 1px solid #1a1a1a;
    padding: 0 1rem;
    gap: 0.25rem;
  }

  .tab {
    background: transparent;
    border: none;
    color: #6b7280;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.7rem 0.9rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover { color: #9ca3af; }

  .tab-active {
    color: #f3f4f6;
    border-bottom-color: #3b82f6;
  }

  /* ── Contenido ── */
  .content {
    flex: 1;
    padding: 1.25rem 1rem;
    overflow-y: auto;
  }

  /* Responsive: más padding en pantallas grandes */
  @media (min-width: 640px) {
    .tabs  { padding: 0 1.5rem; }
    .content { padding: 1.5rem; }
  }
</style>
