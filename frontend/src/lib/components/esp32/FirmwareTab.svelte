<script lang="ts">
  import {
    esp32Store, loadFirmwareCatalog, loadOtaStatus, loadRollbackDevices,
    triggerOta, rollbackDevice, elapsed, statusColor
  } from '$lib/stores/esp32';

  type SubTab = 'catalogo' | 'otas' | 'rollback';
  let subTab: SubTab = 'catalogo';

  let otaDeviceId = '';
  let otaType = '';
  let otaVersion = '';
  let showOtaForm = false;

  $: firmwareTypes = $esp32Store.firmwareTypes;
  $: pending = $esp32Store.otaPending;
  $: log = $esp32Store.otaLog;
  $: rollbackDevices = $esp32Store.rollbackDevices;

  async function handleTriggerOta() {
    if (!otaDeviceId || !otaType) return;
    const success = await triggerOta(otaDeviceId, otaType, otaVersion || undefined);
    if (success) {
      showOtaForm = false;
      otaDeviceId = '';
      otaType = '';
      otaVersion = '';
    }
  }

  async function handleRollback(deviceId: string, type: string) {
    await rollbackDevice(deviceId, type);
  }

  async function handleRefresh() {
    await Promise.all([loadFirmwareCatalog(), loadOtaStatus(), loadRollbackDevices()]);
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
  <!-- Sub-tab bar -->
  <div class="subtab-bar">
    <button class="subtab" class:active={subTab === 'catalogo'} on:click={() => subTab = 'catalogo'}>
      Catalogo
    </button>
    <button class="subtab" class:active={subTab === 'otas'} on:click={() => subTab = 'otas'}>
      OTAs
      {#if pending.length > 0}
        <span class="subtab-badge">{pending.length}</span>
      {/if}
    </button>
    <button class="subtab" class:active={subTab === 'rollback'} on:click={() => subTab = 'rollback'}>
      Rollback
    </button>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

  <!-- CATALOGO -->
  {#if subTab === 'catalogo'}
    {#if firmwareTypes.length === 0}
      <div class="empty-section">
        <span class="empty-text">No hay firmwares registrados. Sube binarios a data/firmware/binaries/ y registralos.</span>
      </div>
    {:else}
      <div class="fw-grid">
        {#each firmwareTypes as fw (fw.type)}
          <div class="fw-card">
            <span class="fw-type">{fw.type}</span>
            <span class="fw-latest">v{fw.latest}</span>
            <span class="fw-count">{fw.releases_count} release{fw.releases_count !== 1 ? 's' : ''}</span>
            {#if fw.releases.length > 1}
              <div class="fw-releases">
                {#each fw.releases.slice(0, 5) as rel}
                  <span class="fw-rel">{rel}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  <!-- OTAS -->
  {:else if subTab === 'otas'}
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
          <select class="input" bind:value={otaType}>
            <option value="">— selecciona —</option>
            {#each firmwareTypes as fw}
              <option value={fw.type}>{fw.type} (v{fw.latest})</option>
            {/each}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Version (vacio = latest)</label>
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
        <h2 class="section-title">En progreso</h2>
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
        {#each log.slice(0, 30) as entry}
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

    {#if pending.length === 0 && log.length === 0}
      <div class="empty-section">
        <span class="empty-text">No hay OTAs pendientes ni recientes.</span>
      </div>
    {/if}

  <!-- ROLLBACK -->
  {:else if subTab === 'rollback'}
    {#if rollbackDevices.length === 0}
      <div class="empty-section">
        <span class="empty-text">No hay dispositivos con historial de firmware para rollback.</span>
      </div>
    {:else}
      <div class="rollback-list">
        {#each rollbackDevices as device (device.device_id)}
          <div class="rollback-row">
            <div class="rollback-info">
              <span class="rollback-device">{device.device_id}</span>
              <span class="rollback-type">{device.type}</span>
            </div>
            <div class="rollback-versions">
              <span class="rollback-current">v{device.current_version}</span>
              {#if device.previous_version}
                <span class="rollback-arrow">←</span>
                <span class="rollback-prev">v{device.previous_version}</span>
              {/if}
            </div>
            <button
              class="btn-rollback"
              disabled={!device.can_rollback}
              on:click={() => handleRollback(device.device_id, device.type)}
            >
              Rollback
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .firmware-tab { display: flex; flex-direction: column; gap: 14px; }

  /* Sub-tab bar */
  .subtab-bar {
    display: flex; gap: 0; align-items: center;
    background: #111; border-radius: 8px; padding: 2px; overflow: hidden;
  }
  .subtab {
    flex: 1; padding: 6px 10px; border: none; background: none;
    color: #666; font-size: 0.7rem; font-weight: 500; cursor: pointer;
    border-radius: 6px; transition: all 0.15s; position: relative;
    display: flex; align-items: center; justify-content: center; gap: 4px;
  }
  .subtab:hover { color: #999; }
  .subtab.active { background: #1a1a1a; color: #f59e0b; }
  .subtab-badge {
    min-width: 14px; height: 14px; border-radius: 7px;
    background: #eab308; color: #000; font-size: 0.5rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 3px;
  }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
    margin-left: 4px; flex-shrink: 0;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .badge-pending {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(59,130,246,0.15); color: #3b82f6;
  }

  /* Firmware grid */
  .fw-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  .fw-card {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 12px 20px; border-radius: 10px; border: 1px solid #222;
    background: #151515; min-width: 120px;
  }
  .fw-type { font-size: 0.75rem; font-weight: 600; }
  .fw-latest { font-size: 1rem; font-weight: 700; color: #f59e0b; }
  .fw-count { font-size: 0.6rem; color: #555; }
  .fw-releases { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
  .fw-rel {
    padding: 1px 6px; background: #1a1a1a; border-radius: 4px;
    font-size: 0.55rem; color: #666; font-family: monospace;
  }

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

  /* Rollback */
  .rollback-list { display: flex; flex-direction: column; gap: 4px; }
  .rollback-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #151515; border-radius: 8px;
  }
  .rollback-info { display: flex; flex-direction: column; flex: 1; }
  .rollback-device { font-size: 0.8rem; font-weight: 600; }
  .rollback-type { font-size: 0.65rem; color: #555; }
  .rollback-versions { display: flex; align-items: center; gap: 6px; }
  .rollback-current { font-size: 0.75rem; font-family: monospace; color: #22c55e; }
  .rollback-arrow { font-size: 0.7rem; color: #444; }
  .rollback-prev { font-size: 0.75rem; font-family: monospace; color: #888; }
  .btn-rollback {
    padding: 5px 12px; border-radius: 6px; border: 1px solid #ef444444;
    background: none; color: #ef4444; font-size: 0.7rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s;
  }
  .btn-rollback:hover { background: rgba(239,68,68,0.1); }
  .btn-rollback:disabled { opacity: 0.3; cursor: default; }

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
