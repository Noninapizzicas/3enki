<script lang="ts">
  /**
   * PanelTrabajadorPanel — cara OPERATIVA / rol HOY del taller 3D.
   *
   * EJE DE ROLES: el TRABAJADOR opera HOY. Ve el estado en vivo de la impresión
   * (pieza + progreso + fase), la próxima a encadenar, los últimos eventos, los
   * pendientes de confirmación del dueño, y ejecuta COMANDOS HOY que DELEGAN
   * (pausar/abortar/reanudar → ciclo; reintentar/saltar → manejo-fallo; cambio_bobina
   * → filamento; confirmar → adaptador-confirmacion). CERO decisión futura (eso es
   * panel-jefe). CERO gesto de jefe.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    panelTrabajadorStore, estadoVivo, proximaEncadenar, eventosTaller,
    pendientesConfirmacion, initPanelTrabajador, initPanelTrabajadorSubscriptions,
    enviarControl, resetPanelTrabajadorStore, type ControlAccion
  } from '$lib/stores/panel-trabajador';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  let proyectoId = '';
  let cleanupSubs: (() => void) | null = null;

  // Control
  let controlAccion: ControlAccion = 'pausar';
  let c_motivo = '', c_tarea_id = '', c_bobina_id = '', c_material = '', c_tipo_conf = '', c_conf_id = '';
  let c_gramos = '';

  const accionesControl: { id: ControlAccion; label: string; icon: string }[] = [
    { id: 'pausar', label: 'Pausar', icon: '⏸' },
    { id: 'abortar', label: 'Abortar', icon: '⏹' },
    { id: 'reanudar', label: 'Reanudar', icon: '▶' },
    { id: 'reintentar', label: 'Reintentar', icon: '🔁' },
    { id: 'saltar', label: 'Saltar', icon: '⏭' },
    { id: 'cambio_bobina', label: 'Cambiar bobina', icon: '🧵' },
    { id: 'confirmar', label: 'Confirmar', icon: '✅' }
  ];

  $: est = $estadoVivo;
  $: prox = $proximaEncadenar;
  $: eventos = $eventosTaller;
  $: pendientes = $pendientesConfirmacion;
  $: saving = $panelTrabajadorStore.saving;
  $: resultado = $panelTrabajadorStore.resultado;
  $: error = $panelTrabajadorStore.error;

  function proyectoActual(): string {
    return proyectoId || '';
  }

  async function handleControl() {
    const pid = proyectoActual();
    if (!pid) return;
    const data: Record<string, unknown> = { accion: controlAccion };
    if (c_motivo.trim()) data.motivo = c_motivo.trim();
    if (c_tarea_id.trim()) data.tarea_id = c_tarea_id.trim();
    if (c_bobina_id.trim()) data.bobina_id = c_bobina_id.trim();
    if (c_material.trim()) data.material = c_material.trim();
    if (c_gramos.trim()) data.gramos_restantes = Number(c_gramos);
    if (c_tipo_conf.trim()) data.tipo_confirmacion = c_tipo_conf.trim();
    if (c_conf_id.trim()) data.confirmacion_id = c_conf_id.trim();
    const ok = await enviarControl(pid, data);
    if (ok.success) {
      c_motivo = ''; c_tarea_id = ''; c_bobina_id = ''; c_material = ''; c_tipo_conf = ''; c_conf_id = ''; c_gramos = '';
    }
  }

  function progresoPct(): number {
    const p = Number(est?.progreso);
    return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0;
  }

  function formatHora(ts?: string): string {
    if (!ts) return '';
    try { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  onMount(async () => {
    const unsub = sessionProjectId.subscribe(v => {
      proyectoId = v || '';
      if (v) {
        cleanupSubs?.();
        cleanupSubs = initPanelTrabajadorSubscriptions(v);
        initPanelTrabajador(v);
      }
    });
    return () => {
      unsub();
      cleanupSubs?.();
    };
  });

  onDestroy(() => {
    resetPanelTrabajadorStore();
  });
</script>

<div class="panel-trabajador">
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-title">🔧 Panel del trabajador</span>
      <span class="panel-sub">Rol HOY · operativo</span>
    </div>
  </header>

  {#if error}<div class="error">⚠ {error}</div>{/if}
  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✓' : resultado.type === 'error' ? '✗' : 'ℹ'} {resultado.message}
    </div>
  {/if}

  <div class="content">
    <!-- ===== ESTADO EN VIVO ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">⚡ Estado en vivo</h3>
      {#if est}
        <div class="estado-card">
          <div class="estado-linea">
            <span class="etiqueta">Fase</span>
            <span class="valor">{est.fase || 'desconocido'}</span>
          </div>
          <div class="estado-linea">
            <span class="etiqueta">Pieza</span>
            <span class="valor">{est.pieza || 'desconocido'}</span>
          </div>
          <div class="estado-linea">
            <span class="etiqueta">Filamento</span>
            <span class="valor">{est.filamento || 'desconocido'}</span>
          </div>
          <div class="progreso-block">
            <span class="etiqueta">Progreso</span>
            <div class="barra"><div class="barra-fill" style="width:{progresoPct()}%"></div></div>
            <span class="pct">{progresoPct()}%</span>
          </div>
        </div>
      {:else}
        <div class="vacio">Sin estado en vivo (selecciona proyecto)</div>
      {/if}
    </section>

    <!-- ===== PRÓXIMA A ENCADENAR ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">⏭ Próxima a encadenar</h3>
      {#if prox && prox.nombre}
        <div class="chip-card">{prox.nombre}{#if prox.tarea_id}<span class="chip-id">({prox.tarea_id})</span>{/if}</div>
      {:else}
        <div class="vacio">Cola vacía o sin definir</div>
      {/if}
    </section>

    <!-- ===== PENDIENTES DE CONFIRMACIÓN ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">⏳ Pendientes de confirmación</h3>
      {#if pendientes.length === 0}
        <div class="vacio">Sin confirmaciones pendientes</div>
      {:else}
        <div class="pend-list">
          {#each pendientes as p (p.confirmacion_id)}
            <div class="pend-item">
              <span class="pend-tipo">{p.tipo || p.confirmacion_id || 'decisión'}</span>
              {#if p.confirmacion_id}<code class="pend-id">{p.confirmacion_id}</code>{/if}
              <button
                class="btn small"
                on:click={() => { controlAccion = 'confirmar'; c_conf_id = p.confirmacion_id || ''; c_tipo_conf = p.tipo || ''; }}
              >Responder</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ===== CONTROLES HOY (delegan) ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">🎛 Controles HOY</h3>
      <p class="seccion-hint">Cada comando DELEGA por RPC a su módulo (ciclo / manejo-fallo / filamento / confirmación) y espera la decisión humana. No decide el futuro.</p>
      <div class="acciones-grid">
        {#each accionesControl as a}
          <button class="accion" class:activa={controlAccion === a.id} on:click={() => controlAccion = a.id}>
            <span>{a.icon}</span>{a.label}
          </button>
        {/each}
      </div>
      <div class="form-campos">
        <label class="form-label">
          <span>Motivo (para abortar)</span>
          <input class="input" bind:value={c_motivo} placeholder="motivo del aborto (opcional)" />
        </label>
        {#if controlAccion === 'reintentar' || controlAccion === 'saltar'}
          <label class="form-label">
            <span>Tarea</span>
            <input class="input" bind:value={c_tarea_id} placeholder="tarea_id (opcional)" />
          </label>
        {/if}
        {#if controlAccion === 'cambio_bobina'}
          <div class="grid-campos">
            <label class="form-label"><span>Bobina</span><input class="input" bind:value={c_bobina_id} placeholder="bobina_id" /></label>
            <label class="form-label"><span>Material</span><input class="input" bind:value={c_material} placeholder="material" /></label>
          </div>
          <label class="form-label"><span>Gramos restantes</span><input class="input" type="number" bind:value={c_gramos} placeholder="gramos" /></label>
        {/if}
        {#if controlAccion === 'confirmar'}
          <div class="grid-campos">
            <label class="form-label"><span>Tipo de confirmación</span><input class="input" bind:value={c_tipo_conf} placeholder="tipo" /></label>
            <label class="form-label"><span>Confirmación id</span><input class="input" bind:value={c_conf_id} placeholder="id" /></label>
          </div>
        {/if}
      </div>
      <button class="btn primary" on:click={handleControl} disabled={saving}>
        {saving ? 'Enviando…' : `Ejecutar ${controlAccion.replace(/_/g, ' ')}`}
      </button>
    </section>

    <!-- ===== ÚLTIMOS EVENTOS ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">🕘 Últimos eventos</h3>
      {#if eventos.length === 0}
        <div class="vacio">Sin eventos registrados</div>
      {:else}
        <div class="eventos-list">
          {#each eventos as ev, i}
            <div class="evento">
              <span class="ev-hora">{formatHora(ev.timestamp)}</span>
              <span class="ev-tipo">{ev.tipo || ev.evento || 'evento'}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .panel-trabajador { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
  .panel-header { padding: 10px 12px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; }
  .header-left { display: flex; align-items: baseline; gap: 10px; }
  .panel-title { font-weight: 600; color: #3b82f6; }
  .panel-sub { font-size: 0.7rem; color: #777; }
  .error, .resultado { padding: 6px 12px; font-size: 0.75rem; border-bottom: 1px solid #222; }
  .error { color: #ef4444; }
  .resultado.ok { color: #22c55e; } .resultado.error { color: #ef4444; } .resultado.info { color: #3b82f6; }
  .content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 18px; }
  .seccion { display: flex; flex-direction: column; gap: 8px; }
  .seccion-titulo { font-size: 0.9rem; color: #ddd; margin: 0; }
  .seccion-hint { font-size: 0.7rem; color: #888; margin: 0; }
  .estado-card { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  .estado-linea { display: flex; gap: 8px; font-size: 0.78rem; }
  .etiqueta { color: #888; min-width: 90px; }
  .valor { color: #ddd; }
  .progreso-block { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; }
  .etiqueta { color: #888; min-width: 90px; }
  .barra { flex: 1; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
  .barra-fill { height: 100%; background: #3b82f6; border-radius: 4px; transition: width .3s; }
  .pct { color: #bbb; min-width: 36px; text-align: right; }
  .vacio { font-size: 0.75rem; color: #666; background: #111; padding: 10px; border-radius: 6px; }
  .chip-card { background: #141414; border: 1px solid #2a2a2a; border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; color: #ddd; display: flex; align-items: center; gap: 8px; }
  .chip-id { font-size: 0.65rem; color: #888; }
  .pend-list { display: flex; flex-direction: column; gap: 6px; }
  .pend-item { display: flex; align-items: center; gap: 10px; background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 8px 10px; }
  .pend-tipo { font-size: 0.8rem; color: #eee; }
  .pend-id { font-size: 0.65rem; color: #888; }
  .acciones-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .accion { display: flex; align-items: center; justify-content: center; gap: 6px; background: #151515; border: 1px solid #2a2a2a; color: #bbb; border-radius: 8px; padding: 9px 8px; font-size: 0.72rem; cursor: pointer; }
  .accion:hover { border-color: #444; }
  .accion.activa { background: rgba(59,130,246,.15); border-color: #3b82f6; color: #3b82f6; }
  .form-campos { display: flex; flex-direction: column; gap: 8px; }
  .grid-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #999; }
  .input { background: #151515; border: 1px solid #2a2a2a; border-radius: 6px; color: #e5e5e5; padding: 7px 9px; font-size: 0.78rem; }
  .btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; border-radius: 6px; padding: 8px 14px; font-size: 0.8rem; cursor: pointer; }
  .btn.small { padding: 4px 10px; font-size: 0.7rem; }
  .btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .eventos-list { display: flex; flex-direction: column; gap: 4px; }
  .evento { display: flex; gap: 10px; font-size: 0.72rem; background: #111; border-radius: 5px; padding: 5px 8px; }
  .ev-hora { color: #666; } .ev-tipo { color: #bbb; }
</style>
