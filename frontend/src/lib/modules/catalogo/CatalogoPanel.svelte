<script lang="ts">
  /**
   * CatalogoPanel — CUSTODIO de la biblioteca de piezas del taller 3D (cara OPERADOR).
   *
   * EJE DE ROLES: es la cara de curaduría diaria del operador. Ver la biblioteca
   * (listar/por_id) y dar de alta/editar fichas (registrar/actualizar). La moneda
   * real del taller es multiformato: archivo_stl / archivo_3mf / archivo_gcode
   * conviven como archivos distintos en la misma ficha. CERO juicio: uso, filamento
   * y aprobación quedan a la decisión del dueño; el custodio solo custodia.
   *
   * Nada de control de máquina (eso es panel-trabajador) ni de decisiones del futuro
   * (eso es panel-jefe). Es 1 solo panel, cara operador — no doble-cara.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    catalogoStore, fichasCatalogo, catalogoLoading, catalogoSaving,
    listarBiblioteca, registrarModelo, actualizarFicha, porId,
    resetCatalogoStore, type ModeloFicha
  } from '$lib/stores/catalogo';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  type Tab = 'biblioteca' | 'registrar' | 'editar' | 'detalle';
  let activeTab: Tab = 'biblioteca';
  let proyectoId = '';

  // Form registrar
  let rNombre = '', rUso = '', rFilamento = 'PETG', rFuente = 'ARCHIVO', rOrigenUrl = '';
  let rStl = '', r3mf = '', rGcode = '';

  // Form editar
  let eModeloId = '', eUso = '', eFilamento = '', eFuente = '', eOrigenUrl = '';
  let eStl = '', e3mf = '', eGcode = '';

  const fuentes = ['DISEÑADO', 'REPOSITORIO', 'ARCHIVO'];

  $: fichas = $fichasCatalogo;
  $: loading = $catalogoLoading;
  $: saving = $catalogoSaving;
  $: resultado = $catalogoStore.resultado;
  $: fichaSel = $catalogoStore.selected;

  $: canRegistrar = rNombre.trim().length > 0;
  $: canEditar = eModeloId.trim().length > 0;

  function proyectoActual(): string {
    if (proyectoId) return proyectoId;
    const pid = sessionProjectId ? $sessionProjectId : '';
    return pid || '';
  }

  function mostrarTab(tab: Tab) {
    activeTab = tab;
    if (tab === 'biblioteca' && proyectoActual()) listarBiblioteca(proyectoActual());
    if (tab === 'editar') resetEditar();
  }

  function resetEditar() {
    eModeloId = ''; eUso = ''; eFilamento = ''; eFuente = ''; eOrigenUrl = '';
    eStl = ''; e3mf = ''; eGcode = '';
  }

  async function handleRegistrar() {
    const pid = proyectoActual();
    if (!pid) return;
    const data: Record<string, unknown> = { nombre: rNombre.trim() };
    if (rUso.trim()) data.uso = rUso.trim();
    if (rFilamento.trim()) data.filamento_sug = rFilamento.trim();
    data.fuente = rFuente;
    if (rOrigenUrl.trim()) data.origenUrl = rOrigenUrl.trim();
    if (rStl.trim()) data.archivo_stl = rStl.trim();
    if (r3mf.trim()) data.archivo_3mf = r3mf.trim();
    if (rGcode.trim()) data.archivo_gcode = rGcode.trim();
    const ok = await registrarModelo(pid, data);
    if (ok.success) {
      rNombre = ''; rUso = ''; rFilamento = 'PETG'; rFuente = 'ARCHIVO'; rOrigenUrl = '';
      rStl = ''; r3mf = ''; rGcode = '';
      activeTab = 'biblioteca';
    }
  }

  async function handleEditar() {
    const pid = proyectoActual();
    if (!pid) return;
    const data: Record<string, unknown> = {};
    if (eUso.trim()) data.uso = eUso.trim();
    if (eFilamento.trim()) data.filamento_sug = eFilamento.trim();
    if (eFuente.trim()) data.fuente = eFuente;
    if (eOrigenUrl.trim()) data.origenUrl = eOrigenUrl.trim();
    if (eStl.trim()) data.archivo_stl = eStl.trim();
    if (e3mf.trim()) data.archivo_3mf = e3mf.trim();
    if (eGcode.trim()) data.archivo_gcode = eGcode.trim();
    const ok = await actualizarFicha(pid, eModeloId, data);
    if (ok.success) {
      activeTab = 'biblioteca';
      resetEditar();
    }
  }

  async function handleVerFicha(ficha: ModeloFicha) {
    const pid = proyectoActual();
    if (!pid) return;
    await porId(pid, ficha.id);
    activeTab = 'detalle';
  }

  function formatosDisponibles(f: ModeloFicha): string {
    const fs: string[] = [];
    if (f.archivo_stl) fs.push('STL');
    if (f.archivo_3mf) fs.push('3MF');
    if (f.archivo_gcode) fs.push('GCODE');
    return fs.length ? fs.join(' · ') : '—';
  }

  onMount(() => {
    const unsub = sessionProjectId.subscribe(v => {
      proyectoId = v || '';
      if (v) listarBiblioteca(v);
    });
    return unsub;
  });

  onDestroy(() => {
    resetCatalogoStore();
  });
</script>

<div class="panel-catalogo">
  <!-- Header / stats -->
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-title">🧊 Catálogo de piezas</span>
      <span class="panel-sub">Cara operador · biblioteca multiformato</span>
    </div>
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'biblioteca'} on:click={() => mostrarTab('biblioteca')}>
        Biblioteca ({fichas.length})
      </button>
      <button class="tab" class:active={activeTab === 'registrar'} on:click={() => mostrarTab('registrar')}>
        Registrar
      </button>
      <button class="tab" class:active={activeTab === 'editar'} on:click={() => mostrarTab('editar')}>
        Editar
      </button>
      {#if activeTab === 'detalle'}
        <button class="tab" class:active={true} on:click={() => mostrarTab('detalle')}>Detalle</button>
      {/if}
    </div>
  </header>

  <!-- Resultado -->
  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✓' : resultado.type === 'error' ? '✗' : 'ℹ'} {resultado.message}
    </div>
  {/if}

  <!-- ===== BIBLIOTECA ===== -->
  {#if activeTab === 'biblioteca'}
    <div class="content">
      {#if loading && fichas.length === 0}
        <div class="empty-state"><span class="empty-icon">⏳</span><span>Cargando biblioteca…</span></div>
      {:else if fichas.length === 0}
        <div class="empty-state"><span class="empty-icon">🧊</span><span>No hay piezas registradas todavía</span></div>
      {:else}
        <div class="grid">
          {#each fichas as f (f.id)}
            <button class="card" on:click={() => handleVerFicha(f)}>
              <div class="card-head">
                <span class="card-nombre">{f.nombre}</span>
                <span class="card-formato">{formatosDisponibles(f)}</span>
              </div>
              <div class="card-body">
                {#if f.uso}<span class="card-uso">“{f.uso}”</span>{/if}
                <div class="card-meta">
                  <span class="tag">{f.fuente || '—'}</span>
                  <span class="tag tag-fil">{f.filamento_sug || 'PETG'}</span>
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

  <!-- ===== REGISTRAR ===== -->
  {:else if activeTab === 'registrar'}
    <div class="content">
      <div class="form-section">
        <h3 class="form-titulo">Nueva ficha de modelo</h3>
        <p class="form-hint">Reconcilia antes de crear (nombre canónico + fuente + origenUrl → NO duplica). Los 3 formatos conviven como archivos distintos.</p>

        <label class="form-label">
          <span>Nombre canónico de la pieza *</span>
          <input type="text" class="input" bind:value={rNombre} placeholder="ej: soporte_ventilador_4020" />
        </label>
        <label class="form-label">
          <span>Qué resuelve la pieza (opcional)</span>
          <input type="text" class="input" bind:value={rUso} placeholder="ej: fija el ventilador 40x20 al hotend" />
        </label>
        <label class="form-label">
          <span>Filamento sugerido</span>
          <input type="text" class="input" bind:value={rFilamento} placeholder="default PETG" />
        </label>
        <label class="form-label">
          <span>Origen</span>
          <div class="chip-group">
            {#each fuentes as f}
              <button class="chip" class:active={rFuente === f} on:click={() => rFuente = f}>{f}</button>
            {/each}
          </div>
        </label>
        <label class="form-label">
          <span>URL de origen (clave de reconciliación, opcional)</span>
          <input type="text" class="input mono" bind:value={rOrigenUrl} placeholder="https://…" />
        </label>

        <fieldset class="formulario-fortmatos">
          <legend>Archivos de la moneda real del taller</legend>
          <label class="form-label">
            <span>.STL</span>
            <input type="text" class="input mono" bind:value={rStl} placeholder="ruta .stl (opcional)" />
          </label>
          <label class="form-label">
            <span>.3MF</span>
            <input type="text" class="input mono" bind:value={r3mf} placeholder="ruta .3mf (opcional)" />
          </label>
          <label class="form-label">
            <span>.GCODE</span>
            <input type="text" class="input mono" bind:value={rGcode} placeholder="ruta .gcode (opcional)" />
          </label>
        </fieldset>

        <button class="btn primary" on:click={handleRegistrar} disabled={!canRegistrar || saving}>
          {saving ? 'Registrando…' : 'Registrar modelo'}
        </button>
      </div>
    </div>

  <!-- ===== EDITAR ===== -->
  {:else if activeTab === 'editar'}
    <div class="content">
      <div class="form-section">
        <h3 class="form-titulo">Editar ficha existente</h3>
        <p class="form-hint">Merge (no re-crea): completa/corrige uso, filamento, archivos, fuente u origen.</p>

        <label class="form-label">
          <span>Pieza a editar *</span>
          <select class="input" bind:value={eModeloId}>
            <option value="">— selecciona —</option>
            {#each fichas as f (f.id)}
              <option value={f.id}>{f.nombre}</option>
            {/each}
          </select>
        </label>
        <label class="form-label">
          <span>Uso nuevo (opcional)</span>
          <input type="text" class="input" bind:value={eUso} placeholder="uso nuevo" />
        </label>
        <label class="form-label">
          <span>Filamento sugerido nuevo</span>
          <input type="text" class="input" bind:value={eFilamento} placeholder="filamento nuevo" />
        </label>
        <label class="form-label">
          <span>Origen nuevo</span>
          <div class="chip-group">
            {#each fuentes as f}
              <button class="chip" class:active={eFuente === f} on:click={() => eFuente = f}>{f}</button>
            {/each}
          </div>
        </label>
        <label class="form-label">
          <span>URL de origen nueva</span>
          <input type="text" class="input mono" bind:value={eOrigenUrl} placeholder="URL nueva (opcional)" />
        </label>

        <fieldset class="formulario-fortmatos">
          <legend>Archivos (reemplazo por formato)</legend>
          <label class="form-label">
            <span>.STL nuevo</span>
            <input type="text" class="input mono" bind:value={eStl} placeholder="ruta .stl nueva" />
          </label>
          <label class="form-label">
            <span>.3MF nuevo</span>
            <input type="text" class="input mono" bind:value={e3mf} placeholder="ruta .3mf nueva" />
          </label>
          <label class="form-label">
            <span>.GCODE nuevo</span>
            <input type="text" class="input mono" bind:value={eGcode} placeholder="ruta .gcode nueva" />
          </label>
        </fieldset>

        <button class="btn primary" on:click={handleEditar} disabled={!canEditar || saving}>
          {saving ? 'Guardando…' : 'Actualizar ficha'}
        </button>
      </div>
    </div>

  <!-- ===== DETALLE ===== -->
  {:else if activeTab === 'detalle'}
    <div class="content">
      {#if fichaSel}
        <div class="detalle">
          <div class="detalle-head">
            <span class="detalle-nombre">{fichaSel.nombre}</span>
            <span class="tag">{fichaSel.fuente || '—'}</span>
          </div>
          <dl>
            <dt>Uso</dt><dd>{fichaSel.uso || '—'}</dd>
            <dt>Filamento sugerido</dt><dd>{fichaSel.filamento_sug || 'PETG'}</dd>
            <dt>Formato disponible</dt><dd>{formatosDisponibles(fichaSel)}</dd>
            <dt>Archivo STL</dt><dd class="mono">{fichaSel.archivo_stl || '—'}</dd>
            <dt>Archivo 3MF</dt><dd class="mono">{fichaSel.archivo_3mf || '—'}</dd>
            <dt>Archivo GCODE</dt><dd class="mono">{fichaSel.archivo_gcode || '—'}</dd>
            <dt>Origen</dt><dd class="mono">{fichaSel.origenUrl || '—'}</dd>
          </dl>
          <button class="btn" on:click={() => { activeTab = 'biblioteca'; }}>← Volver</button>
        </div>
      {:else}
        <div class="empty-state"><span>Selecciona una pieza de la biblioteca</span></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel-catalogo { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
  .panel-header { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; }
  .header-left { display: flex; align-items: baseline; gap: 10px; }
  .panel-title { font-weight: 600; color: #f59e0b; }
  .panel-sub { font-size: 0.7rem; color: #777; }
  .tabs { display: flex; gap: 4px; overflow-x: auto; }
  .tab { background: none; border: none; border-bottom: 2px solid transparent; color: #888; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; white-space: nowrap; }
  .tab.active { color: #f59e0b; border-bottom-color: #f59e0b; }
  .resultado { padding: 6px 12px; font-size: 0.75rem; border-bottom: 1px solid #222; }
  .resultado.ok { color: #22c55e; background: rgba(34,197,94,.08); }
  .resultado.error { color: #ef4444; background: rgba(239,68,68,.08); }
  .resultado.info { color: #3b82f6; background: rgba(59,130,246,.08); }
  .content { flex: 1; overflow-y: auto; padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .card { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 10px; text-align: left; color: inherit; cursor: pointer; transition: border-color .15s; display: flex; flex-direction: column; gap: 6px; }
  .card:hover { border-color: #f59e0b; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .card-nombre { font-size: 0.85rem; font-weight: 600; color: #ddd; }
  .card-formato { font-size: 0.6rem; color: #f59e0b; }
  .card-uso { font-size: 0.7rem; color: #999; font-style: italic; }
  .card-meta { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 0.6rem; padding: 2px 7px; border-radius: 10px; background: #222; color: #aaa; }
  .tag-fil { background: rgba(245,158,11,.15); color: #f59e0b; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 180px; gap: 8px; color: #666; font-size: .8rem; }
  .empty-icon { font-size: 1.8rem; opacity: .4; }
  .form-section { max-width: 520px; display: flex; flex-direction: column; gap: 10px; }
  .form-titulo { font-size: 0.95rem; color: #eee; margin: 0; }
  .form-hint { font-size: 0.72rem; color: #888; margin: 0; }
  .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: #aaa; }
  .input { background: #151515; border: 1px solid #2a2a2a; border-radius: 6px; color: #e5e5e5; padding: 7px 9px; font-size: 0.8rem; }
  .input.mono { font-family: ui-monospace, monospace; }
  .chip-group { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: #1a1a1a; border: 1px solid #2a2a2a; color: #aaa; border-radius: 14px; padding: 4px 12px; font-size: 0.72rem; cursor: pointer; }
  .chip.active { background: rgba(245,158,11,.15); border-color: #f59e0b; color: #f59e0b; }
  .formulario-fortmatos { border: 1px solid #2a2a2a; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .formulario-fortmatos legend { font-size: 0.7rem; color: #888; padding: 0 6px; }
  .btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; border-radius: 6px; padding: 8px 14px; font-size: 0.8rem; cursor: pointer; }
  .btn.primary { background: #f59e0b; border-color: #f59e0b; color: #111; font-weight: 600; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .detalle { display: flex; flex-direction: column; gap: 12px; max-width: 520px; }
  .detalle-head { display: flex; align-items: center; gap: 10px; }
  .detalle-nombre { font-size: 1.1rem; font-weight: 600; color: #eee; }
  .detalle dl { margin: 0; display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; font-size: 0.8rem; }
  .detalle dt { color: #888; } .detalle dd { margin: 0; color: #ddd; }
  .detalle .mono { font-family: ui-monospace, monospace; font-size: 0.72rem; }
</style>
