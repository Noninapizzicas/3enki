<script lang="ts">
  import {
    esp32Store, loadDrivers, loadBoards, buildDriver,
    selectDriver, elapsed, statusColor
  } from '$lib/stores/esp32';

  type SubTab = 'drivers' | 'build';
  let subTab: SubTab = 'drivers';
  let building = false;

  $: driverList = $esp32Store.drivers;
  $: boards = $esp32Store.boards;
  $: selected = $esp32Store.selectedDriver;
  $: buildStatus = $esp32Store.buildStatus;
  $: storeError = $esp32Store.error;
  $: loading = $esp32Store.loading;

  // Detalle del driver seleccionado
  $: selectedDriver = driverList.find(d => d.id === selected) || null;

  async function handleBuild(driverName: string, clean = false) {
    building = true;
    await buildDriver(driverName, clean);
    building = false;
    subTab = 'build';
  }

  async function handleRefresh() {
    await Promise.all([loadDrivers(), loadBoards()]);
  }
</script>

<div class="dev-tab">
  <!-- Sub-tab bar -->
  <div class="subtab-bar">
    <button class="subtab" class:active={subTab === 'drivers'} on:click={() => subTab = 'drivers'}>
      Drivers
      {#if driverList.length > 0}
        <span class="subtab-count">{driverList.length}</span>
      {/if}
    </button>
    <button class="subtab" class:active={subTab === 'build'} on:click={() => subTab = 'build'}>
      Build
      {#if buildStatus?.status === 'building'}
        <span class="subtab-building">...</span>
      {/if}
    </button>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

  <!-- DRIVERS -->
  {#if subTab === 'drivers'}
    {#if storeError}
      <div class="empty-section">
        <span class="error-text">{storeError}</span>
        <button class="btn-retry" on:click={handleRefresh}>Reintentar</button>
      </div>
    {:else if driverList.length === 0 && loading}
      <div class="empty-section">
        <span class="empty-text">Detectando drivers...</span>
      </div>
    {:else if driverList.length === 0}
      <div class="empty-section">
        <span class="empty-text">No hay drivers en firmware/. Cada subdirectorio con platformio.ini es un driver.</span>
        <button class="btn-retry" on:click={handleRefresh}>Reintentar</button>
      </div>
    {:else}
      <div class="driver-list">
        {#each driverList as drv (drv.id)}
          <button
            class="driver-row"
            class:active={selected === drv.id}
            on:click={() => selectDriver(drv.id)}
          >
            <div class="drv-info">
              <span class="drv-name">{drv.name}</span>
              <span class="drv-meta">{drv.board} · {drv.source_files.length} archivos</span>
              {#if drv.description}
                <span class="drv-desc">{drv.description}</span>
              {/if}
            </div>
            <div class="drv-status">
              {#if drv.is_building}
                <span class="drv-badge drv-badge-building">compilando</span>
              {:else if drv.has_binary}
                <span class="drv-badge drv-badge-ok">{((drv.binary_size || 0) / 1024).toFixed(0)} KB</span>
              {:else}
                <span class="drv-badge">sin build</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Driver Detail -->
    {#if selectedDriver}
      <div class="detail-panel">
        <div class="detail-header">
          <h3 class="detail-title">{selectedDriver.name}</h3>
          <div class="detail-actions">
            <button
              class="btn-build"
              disabled={selectedDriver.is_building || building}
              on:click={() => handleBuild(selectedDriver.id)}
            >
              {selectedDriver.is_building ? 'Compilando...' : 'Build'}
            </button>
            <button
              class="btn-build btn-build-clean"
              disabled={selectedDriver.is_building || building}
              on:click={() => handleBuild(selectedDriver.id, true)}
            >
              Clean
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Board</span>
            <span class="detail-value">{selectedDriver.board}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Ultimo build</span>
            <span class="detail-value">{selectedDriver.last_build ? elapsed(selectedDriver.last_build) : 'nunca'}</span>
          </div>
        </div>

        {#if selectedDriver.source_files.length > 0}
          <div class="files-section">
            <span class="form-label">Archivos ({selectedDriver.source_files.length})</span>
            <div class="files-list">
              {#each selectedDriver.source_files as file}
                <span class="file-item">{file}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

  <!-- BUILD -->
  {:else if subTab === 'build'}
    {#if !selected}
      <div class="empty-section">
        <span class="empty-text">Selecciona un driver en la tab Drivers para compilar.</span>
      </div>
    {:else}
      <div class="build-panel">
        <div class="build-header-bar">
          <h3 class="build-title">{selected}</h3>
          <div class="build-actions">
            <button
              class="btn-build"
              disabled={buildStatus?.status === 'building' || building}
              on:click={() => handleBuild(selected, false)}
            >
              Build
            </button>
            <button
              class="btn-build btn-build-clean"
              disabled={buildStatus?.status === 'building' || building}
              on:click={() => handleBuild(selected, true)}
            >
              Clean Build
            </button>
          </div>
        </div>

        {#if buildStatus}
          <div class="build-status-bar">
            <span class="build-dot" style="background: {statusColor(buildStatus.status)}"></span>
            <span class="build-state">{buildStatus.status}</span>
            {#if buildStatus.elapsed_ms}
              <span class="build-elapsed">{(buildStatus.elapsed_ms / 1000).toFixed(1)}s</span>
            {/if}
            {#if buildStatus.log_lines}
              <span class="build-lines">{buildStatus.log_lines} lineas</span>
            {/if}
          </div>

          {#if buildStatus.log_tail}
            <pre class="build-log">{buildStatus.log_tail.join('\n')}</pre>
          {/if}
        {:else}
          <div class="empty-section">
            <span class="empty-text">Sin compilaciones recientes. Pulsa Build para empezar.</span>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .dev-tab { display: flex; flex-direction: column; gap: 14px; }

  /* Sub-tab bar */
  .subtab-bar {
    display: flex; gap: 0; align-items: center;
    background: #111; border-radius: 8px; padding: 2px; overflow: hidden;
  }
  .subtab {
    flex: 1; padding: 6px 10px; border: none; background: none;
    color: #666; font-size: 0.7rem; font-weight: 500; cursor: pointer;
    border-radius: 6px; transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 4px;
  }
  .subtab:hover { color: #999; }
  .subtab.active { background: #1a1a1a; color: #f59e0b; }
  .subtab-count {
    min-width: 14px; height: 14px; border-radius: 7px;
    background: rgba(245,158,11,0.15); color: #f59e0b; font-size: 0.5rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; padding: 0 3px;
  }
  .subtab-building {
    color: #3b82f6; font-weight: 700; animation: blink 1s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
    margin-left: 4px; flex-shrink: 0;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }

  /* Driver list */
  .driver-list { display: flex; flex-direction: column; gap: 4px; }
  .driver-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #151515; border-radius: 8px;
    cursor: pointer; transition: all 0.15s; border: 1px solid transparent;
    color: inherit; font: inherit; text-align: left; width: 100%;
  }
  .driver-row:hover { border-color: #222; }
  .driver-row.active { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
  .drv-info { display: flex; flex-direction: column; flex: 1; }
  .drv-name { font-size: 0.8rem; font-weight: 600; }
  .drv-meta { font-size: 0.65rem; color: #666; }
  .drv-desc { font-size: 0.6rem; color: #555; margin-top: 2px; }
  .drv-status { display: flex; align-items: center; }
  .drv-badge {
    padding: 2px 8px; border-radius: 4px; font-size: 0.6rem; font-weight: 600;
    color: #666; background: #1a1a1a;
  }
  .drv-badge-ok { color: #22c55e; background: rgba(34,197,94,0.1); }
  .drv-badge-building { color: #3b82f6; background: rgba(59,130,246,0.1); animation: blink 1s infinite; }

  /* Detail panel */
  .detail-panel {
    padding: 14px; background: #111; border-radius: 10px; border: 1px solid #222;
    display: flex; flex-direction: column; gap: 12px;
  }
  .detail-header { display: flex; align-items: center; justify-content: space-between; }
  .detail-title { font-size: 0.9rem; font-weight: 600; margin: 0; }
  .detail-actions { display: flex; gap: 6px; }
  .btn-build {
    padding: 5px 14px; border-radius: 6px; border: none;
    background: #22c55e; color: #000; font-weight: 600; cursor: pointer; font-size: 0.7rem;
  }
  .btn-build:disabled { opacity: 0.4; cursor: default; }
  .btn-build-clean { background: #333; color: #ccc; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .detail-item { display: flex; flex-direction: column; gap: 2px; }
  .detail-label { font-size: 0.6rem; color: #555; }
  .detail-value { font-size: 0.75rem; }

  .files-section { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 0.65rem; color: #666; }
  .files-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .file-item {
    padding: 2px 8px; background: #1a1a1a; border-radius: 4px;
    font-size: 0.65rem; font-family: monospace; color: #888;
  }

  /* Build panel */
  .build-panel { display: flex; flex-direction: column; gap: 12px; }
  .build-header-bar { display: flex; align-items: center; justify-content: space-between; }
  .build-title { font-size: 0.9rem; font-weight: 600; margin: 0; }
  .build-actions { display: flex; gap: 6px; }

  .build-status-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: #111; border-radius: 8px;
  }
  .build-dot { width: 8px; height: 8px; border-radius: 50%; }
  .build-state { font-size: 0.8rem; font-weight: 600; flex: 1; }
  .build-elapsed { font-size: 0.7rem; color: #888; }
  .build-lines { font-size: 0.65rem; color: #555; }

  .build-log {
    font-size: 0.65rem; font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    color: #888; background: #050505; border: 1px solid #1a1a1a;
    border-radius: 8px; padding: 10px; margin: 0;
    max-height: 400px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5;
  }
  .build-log::-webkit-scrollbar { width: 5px; }
  .build-log::-webkit-scrollbar-track { background: #050505; }
  .build-log::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }

  .empty-section { padding: 30px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-text { font-size: 0.8rem; color: #555; }
  .error-text { font-size: 0.8rem; color: #ef4444; }
  .btn-retry {
    padding: 6px 16px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; font-size: 0.75rem;
  }
  .btn-retry:hover { color: #ccc; border-color: #555; }
</style>
