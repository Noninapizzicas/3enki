<script lang="ts">
  import {
    dispositivosStore, selectedDevice, selectDevice, loadShadow, setDesired,
    stateColor, typeIcon, elapsed
  } from '$lib/stores/dispositivos';

  let desiredKey = '';
  let desiredValue = '';
  let editingDesired = false;

  $: device = $selectedDevice;
  $: shadow = $dispositivosStore.shadow;
  $: devices = $dispositivosStore.devices;

  function handleSelectDevice(deviceId: string) {
    selectDevice(deviceId);
  }

  async function handleRefresh() {
    if (device) await loadShadow(device.device_id);
  }

  async function handleSetDesired() {
    if (!device || !desiredKey) return;
    let val: any = desiredValue;
    try { val = JSON.parse(desiredValue); } catch {}
    await setDesired(device.device_id, { [desiredKey]: val });
    desiredKey = '';
    desiredValue = '';
    editingDesired = false;
  }

  function formatJson(obj: any): string {
    if (!obj || Object.keys(obj).length === 0) return '(vacío)';
    return JSON.stringify(obj, null, 2);
  }
</script>

<div class="shadow-tab">
  <!-- Device selector -->
  <div class="selector">
    <span class="selector-label">Dispositivo:</span>
    <div class="selector-chips">
      {#each devices as d (d.device_id)}
        <button
          class="chip"
          class:active={device?.device_id === d.device_id}
          on:click={() => handleSelectDevice(d.device_id)}
        >
          <span class="chip-dot" style="background: {stateColor(d.state)}"></span>
          {d.name}
        </button>
      {/each}
    </div>
  </div>

  {#if !device}
    <div class="empty">
      <span class="empty-icon">🔄</span>
      <span class="empty-text">Selecciona un dispositivo para ver su shadow state</span>
    </div>
  {:else if !shadow}
    <div class="empty">
      <span class="empty-icon">⏳</span>
      <span class="empty-text">Cargando shadow de {device.name}...</span>
    </div>
  {:else}
    <!-- Device header -->
    <div class="device-header">
      <div class="device-info">
        <span class="device-icon">{typeIcon(device.type)}</span>
        <div>
          <span class="device-name">{device.name}</span>
          <span class="device-id">{device.device_id}</span>
        </div>
      </div>
      <div class="device-sync">
        {#if shadow.synced}
          <span class="sync-badge synced">Sincronizado</span>
        {:else}
          <span class="sync-badge pending">Delta pendiente</span>
        {/if}
        <button class="btn-refresh" on:click={handleRefresh}>↻</button>
      </div>
    </div>

    <!-- Three columns: Reported / Desired / Delta -->
    <div class="shadow-grid">
      <!-- Reported -->
      <div class="shadow-col">
        <div class="col-header">
          <span class="col-title">Reported</span>
          <span class="col-sub">Lo que tiene el dispositivo</span>
        </div>
        <pre class="json-block">{formatJson(shadow.reported)}</pre>
        {#if shadow.last_reported_at}
          <span class="col-time">Hace {elapsed(shadow.last_reported_at)}</span>
        {/if}
      </div>

      <!-- Desired -->
      <div class="shadow-col">
        <div class="col-header">
          <span class="col-title">Desired</span>
          <span class="col-sub">Lo que queremos que tenga</span>
        </div>
        <pre class="json-block">{formatJson(shadow.desired)}</pre>
        {#if shadow.last_desired_at}
          <span class="col-time">Hace {elapsed(shadow.last_desired_at)}</span>
        {/if}
        <!-- Edit desired -->
        {#if !editingDesired}
          <button class="btn-edit" on:click={() => editingDesired = true}>+ Escribir desired</button>
        {:else}
          <div class="edit-form">
            <input class="input" bind:value={desiredKey} placeholder="key (ej: firmware)" />
            <input class="input" bind:value={desiredValue} placeholder='valor (ej: {"version":"2.2.0"})' />
            <div class="edit-actions">
              <button class="btn-cancel" on:click={() => editingDesired = false}>Cancelar</button>
              <button class="btn-apply" on:click={handleSetDesired}>Aplicar</button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Delta -->
      <div class="shadow-col">
        <div class="col-header">
          <span class="col-title">Delta</span>
          <span class="col-sub">Diferencia (desired - reported)</span>
        </div>
        <pre class="json-block" class:empty-delta={shadow.synced}>{formatJson(shadow.delta)}</pre>
      </div>
    </div>
  {/if}
</div>

<style>
  .shadow-tab { display: flex; flex-direction: column; gap: 16px; }

  /* Selector */
  .selector { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .selector-label { font-size: 0.75rem; color: #666; white-space: nowrap; }
  .selector-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 16px;
    border: 1px solid #2a2a2a;
    background: none;
    color: #999;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { border-color: #444; color: #ccc; }
  .chip.active { border-color: #f59e0b; color: #f59e0b; background: rgba(245, 158, 11, 0.08); }
  .chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  /* Device header */
  .device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 10px;
  }
  .device-info { display: flex; align-items: center; gap: 10px; }
  .device-icon { font-size: 1.5rem; }
  .device-name { font-size: 0.9rem; font-weight: 600; display: block; }
  .device-id { font-size: 0.65rem; color: #555; font-family: monospace; }
  .device-sync { display: flex; align-items: center; gap: 8px; }
  .sync-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.65rem;
    font-weight: 600;
  }
  .sync-badge.synced { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
  .sync-badge.pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
  .btn-refresh {
    width: 28px; height: 28px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; font-size: 1rem; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-refresh:hover { border-color: #555; color: #ccc; }

  /* Shadow grid */
  .shadow-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 900px) {
    .shadow-grid { grid-template-columns: 1fr; }
  }

  .shadow-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #151515;
    border: 1px solid #222;
    border-radius: 10px;
  }
  .col-header { display: flex; flex-direction: column; gap: 2px; }
  .col-title { font-size: 0.85rem; font-weight: 600; }
  .col-sub { font-size: 0.6rem; color: #555; }
  .col-time { font-size: 0.6rem; color: #444; text-align: right; }

  .json-block {
    margin: 0;
    padding: 10px;
    background: #0d0d0d;
    border-radius: 6px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.7rem;
    color: #a5b4c3;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow-y: auto;
    line-height: 1.5;
  }
  .json-block.empty-delta { color: #22c55e; }

  /* Edit form */
  .btn-edit {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px dashed #333;
    background: none;
    color: #666;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-edit:hover { border-color: #f59e0b; color: #f59e0b; }

  .edit-form { display: flex; flex-direction: column; gap: 6px; }
  .input {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #0d0d0d;
    color: #e5e5e5;
    font-size: 0.75rem;
    font-family: monospace;
  }
  .input:focus { outline: none; border-color: #f59e0b; }
  .edit-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .btn-cancel, .btn-apply {
    padding: 4px 12px;
    border-radius: 6px;
    border: none;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .btn-cancel { background: #222; color: #888; }
  .btn-apply { background: #f59e0b; color: #000; font-weight: 600; }

  /* Empty */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 0;
    gap: 8px;
  }
  .empty-icon { font-size: 2.5rem; opacity: 0.3; }
  .empty-text { font-size: 0.85rem; color: #555; }
</style>
