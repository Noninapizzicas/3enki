<script lang="ts">
  import {
    dispositivosStore, triggerOta, loadFirmwareCatalog, loadOtaStatus,
    elapsed, stateColor, typeIcon
  } from '$lib/stores/dispositivos';

  let selectedType: string | null = null;
  let otaDeviceId = '';
  let otaVersion = '';
  let showOtaForm = false;

  $: firmwareTypes = $dispositivosStore.firmwareTypes;
  $: pending = $dispositivosStore.otaPending;
  $: log = $dispositivosStore.otaLog;
  $: devices = $dispositivosStore.devices;

  // Dispositivos que no tienen el firmware latest
  $: outdatedDevices = devices.filter(d => {
    if (!d.firmware || !d.type) return false;
    const fwType = firmwareTypes.find(ft => ft.type === d.type);
    return fwType && d.firmware !== fwType.latest;
  });

  async function handleTriggerOta() {
    if (!otaDeviceId || !selectedType) return;
    const success = await triggerOta(otaDeviceId, selectedType, otaVersion || undefined);
    if (success) {
      showOtaForm = false;
      otaDeviceId = '';
      otaVersion = '';
    }
  }

  async function handleRefresh() {
    await Promise.all([loadFirmwareCatalog(), loadOtaStatus()]);
  }

  function statusBadge(status: string): { color: string; label: string } {
    switch (status) {
      case 'completed': return { color: '#22c55e', label: 'OK' };
      case 'failed': return { color: '#ef4444', label: 'FAIL' };
      default: return { color: '#eab308', label: status };
    }
  }
</script>

<div class="firmware-tab">
  <!-- Header -->
  <div class="section-header">
    <h2 class="section-title">Catálogo de Firmware</h2>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

  <!-- Catalog -->
  {#if firmwareTypes.length === 0}
    <div class="empty-section">
      <span class="empty-text">No hay firmwares registrados. Sube binarios a data/firmware/binaries/ y regístralos.</span>
    </div>
  {:else}
    <div class="fw-grid">
      {#each firmwareTypes as fw (fw.type)}
        <button
          class="fw-card"
          class:active={selectedType === fw.type}
          on:click={() => selectedType = selectedType === fw.type ? null : fw.type}
        >
          <span class="fw-type">{fw.type}</span>
          <span class="fw-latest">v{fw.latest}</span>
          <span class="fw-count">{fw.releases_count} release{fw.releases_count !== 1 ? 's' : ''}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Outdated devices -->
  {#if outdatedDevices.length > 0}
    <div class="section-header">
      <h2 class="section-title">Dispositivos desactualizados</h2>
      <span class="badge-warn">{outdatedDevices.length}</span>
    </div>
    <div class="outdated-list">
      {#each outdatedDevices as d (d.device_id)}
        {@const fwType = firmwareTypes.find(ft => ft.type === d.type)}
        <div class="outdated-row">
          <span class="row-dot" style="background: {stateColor(d.state)}"></span>
          <span class="row-icon">{typeIcon(d.type)}</span>
          <span class="row-name">{d.name}</span>
          <span class="row-version">fw {d.firmware}</span>
          <span class="row-arrow">→</span>
          <span class="row-target">v{fwType?.latest || '?'}</span>
          <button
            class="btn-ota-small"
            disabled={d.state !== 'online'}
            on:click={() => { otaDeviceId = d.device_id; selectedType = d.type; showOtaForm = true; }}
          >
            OTA
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- OTA Trigger Form -->
  {#if showOtaForm}
    <div class="ota-form">
      <h3 class="form-title">Enviar OTA</h3>
      <div class="form-row">
        <label class="form-label">Device ID</label>
        <input class="input" bind:value={otaDeviceId} placeholder="esp32-cocina-01" />
      </div>
      <div class="form-row">
        <label class="form-label">Tipo firmware</label>
        <input class="input" bind:value={selectedType} placeholder="esp32-gateway-printer" />
      </div>
      <div class="form-row">
        <label class="form-label">Versión (vacío = latest)</label>
        <input class="input" bind:value={otaVersion} placeholder="2.2.0" />
      </div>
      <div class="form-actions">
        <button class="btn-cancel" on:click={() => showOtaForm = false}>Cancelar</button>
        <button class="btn-ota" on:click={handleTriggerOta}>Enviar OTA</button>
      </div>
    </div>
  {:else}
    <button class="btn-trigger" on:click={() => showOtaForm = true}>+ Enviar OTA manual</button>
  {/if}

  <!-- Pending OTAs -->
  {#if pending.length > 0}
    <div class="section-header">
      <h2 class="section-title">OTAs en progreso</h2>
      <span class="badge-pending">{pending.length}</span>
    </div>
    <div class="log-list">
      {#each pending as ota (ota.device_id)}
        <div class="log-row">
          <span class="log-device">{ota.device_id}</span>
          <span class="log-version">{ota.previous_version || '?'} → {ota.target_version}</span>
          <span class="log-badge" style="background: rgba(234,179,8,0.15); color: #eab308;">EN CURSO</span>
          <span class="log-time">{elapsed(ota.requested_at)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- OTA Log -->
  {#if log.length > 0}
    <div class="section-header">
      <h2 class="section-title">Historial OTA</h2>
    </div>
    <div class="log-list">
      {#each log.slice(0, 20) as entry}
        {@const badge = statusBadge(entry.status)}
        <div class="log-row">
          <span class="log-device">{entry.device_id}</span>
          <span class="log-version">{entry.from || '?'} → {entry.to}</span>
          <span class="log-badge" style="background: {badge.color}20; color: {badge.color};">{badge.label}</span>
          <span class="log-time">{elapsed(entry.timestamp)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .firmware-tab { display: flex; flex-direction: column; gap: 16px; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }
  .badge-warn {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(234,179,8,0.15); color: #eab308;
  }
  .badge-pending {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(59,130,246,0.15); color: #3b82f6;
  }

  /* Firmware grid */
  .fw-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  .fw-card {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 12px 20px; border-radius: 10px; border: 1px solid #222;
    background: #151515; cursor: pointer; transition: all 0.15s; color: inherit;
    font: inherit;
  }
  .fw-card:hover { border-color: #333; }
  .fw-card.active { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
  .fw-type { font-size: 0.75rem; font-weight: 600; }
  .fw-latest { font-size: 1rem; font-weight: 700; color: #f59e0b; }
  .fw-count { font-size: 0.6rem; color: #555; }

  /* Outdated */
  .outdated-list { display: flex; flex-direction: column; gap: 4px; }
  .outdated-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: #151515; border-radius: 8px;
  }
  .row-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .row-icon { font-size: 0.9rem; }
  .row-name { font-size: 0.8rem; font-weight: 500; flex: 1; }
  .row-version { font-size: 0.7rem; color: #888; font-family: monospace; }
  .row-arrow { font-size: 0.7rem; color: #444; }
  .row-target { font-size: 0.7rem; color: #22c55e; font-weight: 600; font-family: monospace; }
  .btn-ota-small {
    padding: 3px 10px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #f59e0b; font-size: 0.65rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s;
  }
  .btn-ota-small:hover { background: rgba(245,158,11,0.1); }
  .btn-ota-small:disabled { opacity: 0.3; cursor: default; }

  /* OTA Form */
  .ota-form {
    padding: 14px; background: #151515; border: 1px solid #f59e0b33;
    border-radius: 10px; display: flex; flex-direction: column; gap: 10px;
  }
  .form-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .form-row { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 0.65rem; color: #666; }
  .input {
    padding: 6px 10px; border-radius: 6px; border: 1px solid #333;
    background: #0d0d0d; color: #e5e5e5; font-size: 0.8rem;
  }
  .input:focus { outline: none; border-color: #f59e0b; }
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-cancel { padding: 6px 14px; border-radius: 6px; border: none; background: #222; color: #888; cursor: pointer; font-size: 0.75rem; }
  .btn-ota { padding: 6px 14px; border-radius: 6px; border: none; background: #f59e0b; color: #000; font-weight: 600; cursor: pointer; font-size: 0.75rem; }
  .btn-trigger {
    padding: 8px 14px; border-radius: 8px; border: 1px dashed #333;
    background: none; color: #666; font-size: 0.75rem; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-trigger:hover { border-color: #f59e0b; color: #f59e0b; }

  /* Log */
  .log-list { display: flex; flex-direction: column; gap: 3px; }
  .log-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; background: #111; border-radius: 6px; font-size: 0.75rem;
  }
  .log-device { font-weight: 500; min-width: 120px; }
  .log-version { color: #888; font-family: monospace; font-size: 0.7rem; flex: 1; }
  .log-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 600; }
  .log-time { color: #444; font-size: 0.65rem; }

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
