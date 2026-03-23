<script lang="ts">
  import {
    esp32Store, loadTemplates, loadProjects, loadBoards,
    createProject, deleteProject, buildProject, selectProject,
    loadBuildStatus, elapsed, boardIcon, statusColor
  } from '$lib/stores/esp32';

  type SubTab = 'templates' | 'proyectos' | 'build';
  let subTab: SubTab = 'templates';

  // Create form
  let showCreateForm = false;
  let newProjectName = '';
  let newTemplate = '';
  let newBoard = 'esp32dev';
  let newVars: Record<string, string> = {};
  let varKey = '';
  let varValue = '';
  let createError = '';
  let building = false;

  $: templates = $esp32Store.templates;
  $: projects = $esp32Store.projects;
  $: boards = $esp32Store.boards;
  $: selected = $esp32Store.selectedProject;
  $: detail = $esp32Store.projectDetail;
  $: buildStatus = $esp32Store.buildStatus;

  async function handleCreate() {
    createError = '';
    if (!newProjectName || !newTemplate) {
      createError = 'Nombre y template requeridos';
      return;
    }
    const result = await createProject({
      project_name: newProjectName,
      template: newTemplate,
      board: newBoard,
      vars: Object.keys(newVars).length > 0 ? newVars : undefined
    });
    if (result.success) {
      showCreateForm = false;
      newProjectName = '';
      newTemplate = '';
      newVars = {};
      subTab = 'proyectos';
    } else {
      createError = result.error || 'Error';
    }
  }

  function addVar() {
    if (varKey && varValue) {
      newVars = { ...newVars, [varKey]: varValue };
      varKey = '';
      varValue = '';
    }
  }

  function removeVar(key: string) {
    const { [key]: _, ...rest } = newVars;
    newVars = rest;
  }

  async function handleBuild(name: string, clean = false) {
    building = true;
    await buildProject(name, clean);
    building = false;
    subTab = 'build';
  }

  async function handleDelete(name: string) {
    await deleteProject(name);
  }

  async function handleRefresh() {
    await Promise.all([loadTemplates(), loadProjects(), loadBoards()]);
  }
</script>

<div class="dev-tab">
  <!-- Sub-tab bar -->
  <div class="subtab-bar">
    <button class="subtab" class:active={subTab === 'templates'} on:click={() => subTab = 'templates'}>
      Templates
    </button>
    <button class="subtab" class:active={subTab === 'proyectos'} on:click={() => subTab = 'proyectos'}>
      Proyectos
      {#if projects.length > 0}
        <span class="subtab-count">{projects.length}</span>
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

  <!-- TEMPLATES -->
  {#if subTab === 'templates'}
    {#if templates.length === 0}
      <div class="empty-section">
        <span class="empty-text">Cargando templates...</span>
      </div>
    {:else}
      <div class="tpl-grid">
        {#each templates as tpl (tpl.id)}
          <button
            class="tpl-card"
            class:active={newTemplate === tpl.id}
            on:click={() => { newTemplate = tpl.id; showCreateForm = true; }}
          >
            <span class="tpl-cat">{tpl.category}</span>
            <span class="tpl-name">{tpl.name}</span>
            <span class="tpl-desc">{tpl.description}</span>
            <span class="tpl-boards">{tpl.boards.map(b => boardIcon(b)).join(' ')}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Create Form -->
    {#if showCreateForm}
      <div class="create-form">
        <h3 class="form-title">Nuevo Proyecto</h3>
        <div class="form-row">
          <label class="form-label">Nombre (slug)</label>
          <input class="input" bind:value={newProjectName} placeholder="mi-sensor-cocina" />
        </div>
        <div class="form-row">
          <label class="form-label">Template</label>
          <select class="input" bind:value={newTemplate}>
            {#each templates as tpl}
              <option value={tpl.id}>{tpl.name}</option>
            {/each}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Board</label>
          <select class="input" bind:value={newBoard}>
            {#each boards as b}
              <option value={b.id}>{b.name} ({b.flash}{b.psram ? ' + PSRAM' : ''})</option>
            {/each}
          </select>
        </div>

        <!-- Variables -->
        <div class="form-row">
          <label class="form-label">Variables de template</label>
          <div class="var-input-row">
            <input class="input input-sm" bind:value={varKey} placeholder="WIFI_SSID" />
            <input class="input input-sm" bind:value={varValue} placeholder="MiRed" />
            <button class="btn-add-var" on:click={addVar}>+</button>
          </div>
          {#each Object.entries(newVars) as [k, v]}
            <div class="var-tag">
              <span>{k}={v}</span>
              <button class="btn-remove-var" on:click={() => removeVar(k)}>×</button>
            </div>
          {/each}
        </div>

        {#if createError}
          <div class="error-msg">{createError}</div>
        {/if}

        <div class="form-actions">
          <button class="btn-cancel" on:click={() => showCreateForm = false}>Cancelar</button>
          <button class="btn-create" on:click={handleCreate}>Crear Proyecto</button>
        </div>
      </div>
    {/if}

  <!-- PROYECTOS -->
  {:else if subTab === 'proyectos'}
    {#if projects.length === 0}
      <div class="empty-section">
        <span class="empty-text">No hay proyectos. Ve a Templates para crear uno.</span>
      </div>
    {:else}
      <div class="project-list">
        {#each projects as proj (proj.name)}
          <button
            class="project-row"
            class:active={selected === proj.name}
            on:click={() => selectProject(proj.name)}
          >
            <span class="proj-icon">{boardIcon(proj.board)}</span>
            <div class="proj-info">
              <span class="proj-name">{proj.name}</span>
              <span class="proj-meta">{proj.template} · {proj.board}</span>
            </div>
            <div class="proj-status">
              {#if proj.last_build_status}
                <span class="proj-build-dot" style="background: {statusColor(proj.last_build_status)}"></span>
                <span class="proj-build-label">{proj.last_build_status}</span>
              {:else}
                <span class="proj-build-label">sin build</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Project Detail -->
    {#if selected && detail}
      <div class="detail-panel">
        <div class="detail-header">
          <h3 class="detail-title">{detail.name}</h3>
          <div class="detail-actions">
            <button
              class="btn-build"
              disabled={detail.is_building || building}
              on:click={() => handleBuild(detail.name)}
            >
              {detail.is_building ? 'Compilando...' : 'Build'}
            </button>
            <button class="btn-delete" on:click={() => handleDelete(detail.name)}>Eliminar</button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Template</span>
            <span class="detail-value">{detail.template}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Board</span>
            <span class="detail-value">{detail.board}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Framework</span>
            <span class="detail-value">{detail.framework}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Creado</span>
            <span class="detail-value">{elapsed(detail.created_at)}</span>
          </div>
        </div>

        {#if detail.binary}
          <div class="binary-info">
            <span class="binary-icon">📦</span>
            <span class="binary-path">{detail.binary.path.split('/').pop()}</span>
            <span class="binary-size">{(detail.binary.size / 1024).toFixed(0)} KB</span>
          </div>
        {/if}

        {#if detail.files.length > 0}
          <div class="files-section">
            <span class="form-label">Archivos ({detail.files.length})</span>
            <div class="files-list">
              {#each detail.files as file}
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
        <span class="empty-text">Selecciona un proyecto en la tab Proyectos para compilar.</span>
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

        {#if detail?.binary}
          <div class="binary-info">
            <span class="binary-icon">📦</span>
            <span class="binary-path">{detail.binary.path.split('/').pop()}</span>
            <span class="binary-size">{(detail.binary.size / 1024).toFixed(0)} KB</span>
            <span class="binary-date">{elapsed(detail.binary.modified)}</span>
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

  /* Templates grid */
  .tpl-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  .tpl-card {
    display: flex; flex-direction: column; gap: 4px;
    padding: 12px 16px; border-radius: 10px; border: 1px solid #222;
    background: #151515; cursor: pointer; transition: all 0.15s;
    max-width: 200px; text-align: left; color: inherit; font: inherit;
  }
  .tpl-card:hover { border-color: #333; }
  .tpl-card.active { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
  .tpl-cat { font-size: 0.55rem; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
  .tpl-name { font-size: 0.8rem; font-weight: 600; }
  .tpl-desc { font-size: 0.65rem; color: #888; line-height: 1.3; }
  .tpl-boards { font-size: 0.75rem; margin-top: 4px; }

  /* Create form */
  .create-form {
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
  .input-sm { flex: 1; font-size: 0.75rem; padding: 4px 8px; }

  .var-input-row { display: flex; gap: 6px; align-items: center; }
  .btn-add-var {
    width: 28px; height: 28px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #22c55e; font-size: 1rem; cursor: pointer;
  }
  .var-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; background: #1a1a2e; border-radius: 4px;
    font-size: 0.7rem; color: #8888cc; font-family: monospace; margin-top: 4px;
  }
  .btn-remove-var { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; padding: 0; }
  .error-msg { font-size: 0.75rem; color: #ef4444; padding: 4px 0; }
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-cancel { padding: 6px 14px; border-radius: 6px; border: none; background: #222; color: #888; cursor: pointer; font-size: 0.75rem; }
  .btn-create { padding: 6px 14px; border-radius: 6px; border: none; background: #f59e0b; color: #000; font-weight: 600; cursor: pointer; font-size: 0.75rem; }

  /* Projects list */
  .project-list { display: flex; flex-direction: column; gap: 4px; }
  .project-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #151515; border-radius: 8px;
    cursor: pointer; transition: all 0.15s; border: 1px solid transparent;
    color: inherit; font: inherit; text-align: left; width: 100%;
  }
  .project-row:hover { border-color: #222; }
  .project-row.active { border-color: #f59e0b; background: rgba(245,158,11,0.05); }
  .proj-icon { font-size: 1.2rem; }
  .proj-info { display: flex; flex-direction: column; flex: 1; }
  .proj-name { font-size: 0.8rem; font-weight: 600; }
  .proj-meta { font-size: 0.65rem; color: #666; }
  .proj-status { display: flex; align-items: center; gap: 4px; }
  .proj-build-dot { width: 6px; height: 6px; border-radius: 50%; }
  .proj-build-label { font-size: 0.65rem; color: #666; }

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
  .btn-delete {
    padding: 5px 12px; border-radius: 6px; border: 1px solid #333;
    background: none; color: #ef4444; cursor: pointer; font-size: 0.7rem;
  }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .detail-item { display: flex; flex-direction: column; gap: 2px; }
  .detail-label { font-size: 0.6rem; color: #555; }
  .detail-value { font-size: 0.75rem; }

  .binary-info {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: rgba(34,197,94,0.08); border-radius: 8px;
  }
  .binary-icon { font-size: 1rem; }
  .binary-path { font-size: 0.75rem; font-family: monospace; flex: 1; }
  .binary-size { font-size: 0.7rem; color: #22c55e; font-weight: 600; }
  .binary-date { font-size: 0.6rem; color: #666; }

  .files-section { display: flex; flex-direction: column; gap: 4px; }
  .files-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .file-item {
    padding: 2px 8px; background: #1a1a1a; border-radius: 4px;
    font-size: 0.65rem; font-family: monospace; color: #888;
  }

  /* Build panel */
  .build-panel {
    display: flex; flex-direction: column; gap: 12px;
  }
  .build-header-bar { display: flex; align-items: center; justify-content: space-between; }
  .build-title { font-size: 0.9rem; font-weight: 600; margin: 0; }
  .build-actions { display: flex; gap: 6px; }

  .build-status-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: #111; border-radius: 8px;
  }
  .build-dot {
    width: 8px; height: 8px; border-radius: 50%;
  }
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

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
