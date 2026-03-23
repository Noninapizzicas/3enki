<script lang="ts">
  import {
    esp32Store, loadTemplates, loadProjects, loadBoards,
    createProject, deleteProject, buildProject, selectProject,
    loadBuildStatus, elapsed, boardIcon, statusColor
  } from '$lib/stores/esp32';

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

  async function handleBuild(name: string) {
    building = true;
    await buildProject(name);
    building = false;
  }

  async function handleDelete(name: string) {
    await deleteProject(name);
  }

  async function handleRefresh() {
    await Promise.all([loadTemplates(), loadProjects(), loadBoards()]);
  }
</script>

<div class="dev-tab">
  <!-- Templates -->
  <div class="section-header">
    <h2 class="section-title">Templates</h2>
    <button class="btn-icon" on:click={handleRefresh}>↻</button>
  </div>

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

  <!-- Projects List -->
  <div class="section-header">
    <h2 class="section-title">Proyectos</h2>
    <span class="badge">{projects.length}</span>
  </div>

  {#if projects.length === 0}
    <div class="empty-section">
      <span class="empty-text">No hay proyectos. Selecciona un template para crear uno.</span>
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

      <!-- Build Status -->
      {#if buildStatus && buildStatus.status === 'building'}
        <div class="build-log">
          <div class="build-header">
            <span class="build-status-dot"></span>
            <span>Compilando... {buildStatus.elapsed_ms ? `(${(buildStatus.elapsed_ms / 1000).toFixed(0)}s)` : ''}</span>
          </div>
          {#if buildStatus.log_tail}
            <pre class="log-output">{buildStatus.log_tail.join('\n')}</pre>
          {/if}
        </div>
      {/if}

      <!-- Files -->
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
</div>

<style>
  .dev-tab { display: flex; flex-direction: column; gap: 16px; }

  .section-header { display: flex; align-items: center; gap: 8px; }
  .section-title { font-size: 0.85rem; font-weight: 600; margin: 0; }
  .btn-icon {
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid #333;
    background: none; color: #888; cursor: pointer; transition: all 0.15s;
  }
  .btn-icon:hover { color: #ccc; border-color: #555; }
  .badge {
    padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    background: rgba(59,130,246,0.15); color: #3b82f6;
  }

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
  .btn-remove-var {
    background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; padding: 0;
  }
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

  .build-log {
    background: #0a0a0a; border-radius: 8px; padding: 10px; border: 1px solid #222;
  }
  .build-header { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; margin-bottom: 8px; }
  .build-status-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .log-output {
    font-size: 0.65rem; font-family: monospace; color: #888;
    max-height: 200px; overflow-y: auto; margin: 0; white-space: pre-wrap;
    line-height: 1.4;
  }

  .files-section { display: flex; flex-direction: column; gap: 4px; }
  .files-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .file-item {
    padding: 2px 8px; background: #1a1a1a; border-radius: 4px;
    font-size: 0.65rem; font-family: monospace; color: #888;
  }

  .empty-section { padding: 30px; text-align: center; }
  .empty-text { font-size: 0.8rem; color: #555; }
</style>
