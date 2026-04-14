<script lang="ts">
  /**
   * DeviceStatusButton — Botón embebible para cualquier ruta.
   * Muestra el conteo de dispositivos online y alertas activas.
   * Al hacer click, abre DeviceStatusPanel.
   *
   * Uso:
   *   <DeviceStatusButton />
   *
   * El botón se autogestiona: carga datos del store de dispositivos,
   * se suscribe a cambios en tiempo real, y abre/cierra el panel.
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    dispositivosStore, healthAlerts,
    loadDevices, loadDeviceStats, loadHealth,
    initDispositivosSubscriptions,
    type Device
  } from '$lib/stores/dispositivos';

  import DeviceStatusPanel from './DeviceStatusPanel.svelte';

  let panelOpen = false;
  let cleanupSubs: (() => void) | null = null;
  let initialized = false;

  $: onlineCount = $dispositivosStore.devices.filter(d => d.state === 'online').length;
  $: totalCount = $dispositivosStore.devices.length;
  $: alertCount = $healthAlerts.length;
  $: hasProblems = alertCount > 0 || $dispositivosStore.devices.some(d => d.state !== 'online');

  onMount(async () => {
    // Solo cargar si no hay datos (otro componente puede haber cargado ya)
    if ($dispositivosStore.devices.length === 0) {
      await Promise.all([loadDevices(), loadDeviceStats(), loadHealth()]);
    }
    cleanupSubs = initDispositivosSubscriptions();
    initialized = true;
  });

  onDestroy(() => {
    cleanupSubs?.();
  });

  function toggle() {
    panelOpen = !panelOpen;
    if (panelOpen && initialized) {
      // Refrescar datos al abrir
      loadDevices();
      loadHealth();
    }
  }
</script>

<div class="device-status-wrapper">
  <button class="device-btn" class:has-problems={hasProblems} on:click={toggle} title="Dispositivos">
    <span class="device-btn-icon">📟</span>
    <span class="device-btn-count">{onlineCount}/{totalCount}</span>
    {#if alertCount > 0}
      <span class="device-btn-badge">{alertCount > 99 ? '99+' : alertCount}</span>
    {/if}
  </button>

  {#if panelOpen}
    <DeviceStatusPanel on:close={() => panelOpen = false} />
  {/if}
</div>

<style>
  .device-status-wrapper {
    position: relative;
    display: inline-flex;
  }

  .device-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--color-surface, #1e293b);
    border: 1px solid var(--color-border, #334155);
    border-radius: 8px;
    color: var(--color-text, #e2e8f0);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
  }

  .device-btn:hover {
    background: var(--color-surface-hover, #334155);
    border-color: var(--color-border-hover, #475569);
  }

  .device-btn.has-problems {
    border-color: var(--color-warning, #f59e0b);
  }

  .device-btn-icon {
    font-size: 1em;
  }

  .device-btn-count {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .device-btn-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--color-danger, #ef4444);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>
