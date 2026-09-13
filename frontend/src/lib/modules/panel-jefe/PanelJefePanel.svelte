<script lang="ts">
  /**
   * PanelJefePanel — cara AGREGADA / rol FUTURO del taller 3D.
   *
   * EJE DE ROLES: el JEFE ve FUTURO (panorama agregado: impresión actual + cola +
   * filamento + consumo + historial) y DECIDE. Cada decisión DELEGA por RPC
   * (aprobar_propuesta → cola.reordenar; marcar_prioridad → cola.marcar_urgente;
   * pedir_reposicion → adaptador). PROPUESTA ≠ DECISIÓN. CERO control de máquina
   * (pausar/abortar son del trabajador). No hay gesto de operario aquí.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    panelJefeStore, resumenTaller, propuestasOrden, initPanelJefe,
    initPanelJefeSubscriptions, aprobarPropuesta, marcarPrioridad, pedirReposicion,
    resetPanelJefeStore, type PropuestaOrdenItem
  } from '$lib/stores/panel-jefe';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  let proyectoId = '';
  let cleanupSubs: (() => void) | null = null;

  let prioId = '';
  let prioUrgente: 'true' | 'false' = 'true';
  let repBobina = '', repConf = '';

  $: resumen = $resumenTaller;
  $: propuestas = $propuestasOrden;
  $: saving = $panelJefeStore.saving;
  $: resultado = $panelJefeStore.resultado;
  $: error = $panelJefeStore.error;

  function proyectoActual(): string {
    return proyectoId || '';
  }

  async function handleAprobar() {
    const pid = proyectoActual();
    if (!pid) return;
    const orden = propuestas.map((p) => p.id || p.tarea_id).filter(Boolean);
    if (orden.length === 0) return;
    await aprobarPropuesta(pid, orden);
  }

  async function handleAprobarUna(item: PropuestaOrdenItem) {
    const pid = proyectoActual();
    if (!pid) return;
    const id = item.id ?? item.tarea_id;
    if (!id) return;
    await marcarPrioridad(pid, id, 'true');
  }

  async function handleMarcarPrioridad() {
    const pid = proyectoActual();
    if (!pid) return;
    await marcarPrioridad(pid, prioId, prioUrgente);
  }

  async function handlePedirReposicion() {
    const pid = proyectoActual();
    if (!pid) return;
    await pedirReposicion(pid, { bobina_id: repBobina.trim() || undefined, confirmacion_id: repConf.trim() || undefined });
  }

  function claveDe(item: PropuestaOrdenItem): string {
    return item.id ?? item.tarea_id ?? item.nombre ?? 'item';
  }

  onMount(() => {
    const unsub = sessionProjectId.subscribe(v => {
      proyectoId = v || '';
      if (v) {
        cleanupSubs?.();
        cleanupSubs = initPanelJefeSubscriptions(v);
        initPanelJefe(v);
      }
    });
    return () => {
      unsub();
      cleanupSubs?.();
    };
  });

  onDestroy(() => {
    resetPanelJefeStore();
  });
</script>

<div class="panel-jefe">
  <header class="panel-header">
    <div class="header-left">
      <span class="panel-title">🗂 Panel del jefe</span>
      <span class="panel-sub">Rol FUTURO · agregado · decide</span>
    </div>
  </header>

  {#if error}<div class="error">⚠ {error}</div>{/if}
  {#if resultado}
    <div class="resultado {resultado.type}">
      {resultado.type === 'ok' ? '✓' : resultado.type === 'error' ? '✗' : 'ℹ'} {resultado.message}
    </div>
  {/if}

  <div class="content">
    <!-- ===== RESULTADOS AGREGADOS (dashboard) ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">📊 Panorama del taller</h3>
      <div class="kpis">
        <div class="kpi">
          <span class="kpi-label">Impresión actual</span>
          <span class="kpi-val">{resumen?.impresion_actual?.fase || '—'}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Cola</span>
          <span class="kpi-val">{Array.isArray(resumen?.cola) ? resumen.cola.length : 0}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Filamento</span>
          <span class="kpi-val">{resumen?.filamento?.material || '—'}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Consumo</span>
          <span class="kpi-val">{Array.isArray(resumen?.consumo) ? resumen.consumo.length : 0}</span>
        </div>
      </div>

      {#if resumen?.impresion_actual && resumen.impresion_actual.pieza}
        <div class="detalle-actual">
          <span class="d-label">Pieza en impresión</span>
          <span class="d-val">{resumen.impresion_actual.pieza}</span>
        </div>
      {/if}

      {#if resumen?.historial && resumen.historial.length > 0}
        <h4 class="sub-titulo">Historial reciente</h4>
        <div class="hist-grid">
          {#each resumen.historial as h, i}
            <div class="hist-chip">{h.pieza || h.nombre || h.tipo || `evento ${i + 1}`}</div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ===== PROPUESTAS DE ORDEN (NO decisión) ===== -->
    <section class="seccion">
      <div class="seccion-head">
        <h3 class="seccion-titulo">📋 Propuestas de orden</h3>
        <button class="btn small" on:click={handleAprobar} disabled={saving || propuestas.length === 0}>
          {saving ? '…' : '✓ Aprobar propuesta'}
        </button>
      </div>
      <p class="seccion-hint">PROPUESTA ≠ DECISIÓN: el motor propone, el jefe aprueba. Aprobar convierte la propuesta en el nuevo orden de la cola (cola.reordenar).</p>
      {#if propuestas.length === 0}
        <div class="vacio">Sin propuestas disponibles</div>
      {:else}
        <div class="prop-list">
          {#each propuestas as p, i}
            <div class="prop-item">
              <span class="prop-ord" class:top={i === 0}>{i + 1}</span>
              <span class="prop-nombre">{p.nombre || p.tarea_id || p.id || '—'}</span>
              <button class="btn tiny" on:click={() => handleAprobarUna(p)} title="Marcar como urgente">⬆ urgente</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ===== DECISIONES (delegan) ===== -->
    <section class="seccion">
      <h3 class="seccion-titulo">⚖️ Decisiones del jefe (delegan)</h3>
      <div class="decision-card">
        <h4 class="sub-titulo">Marcar prioridad</h4>
        <div class="form-row">
          <label class="form-label">
            <span>id / tarea_id *</span>
            <input class="input" bind:value={prioId} placeholder="id o tarea_id" />
          </label>
          <label class="form-label">
            <span>Urgente</span>
            <select class="input" bind:value={prioUrgente}>
              <option value="true">Sí (urgente)</option>
              <option value="false">No</option>
            </select>
          </label>
        </div>
        <button class="btn primary" on:click={handleMarcarPrioridad} disabled={!prioId || saving}>
          Marcar prioridad
        </button>
      </div>

      <div class="decision-card">
        <h4 class="sub-titulo">Pedir reposición de filamento</h4>
        <div class="form-row">
          <label class="form-label">
            <span>Bobina a reponer</span>
            <input class="input" bind:value={repBobina} placeholder="bobina_id (opcional)" />
          </label>
          <label class="form-label">
            <span>Confirmación</span>
            <input class="input" bind:value={repConf} placeholder="confirmacion_id (opcional)" />
          </label>
        </div>
        <button class="btn primary" on:click={handlePedirReposicion} disabled={saving}>
          Pedir reposición
        </button>
      </div>
    </section>
  </div>
</div>

<style>
  .panel-jefe { display: flex; flex-direction: column; height: 100%; background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
  .panel-header { padding: 10px 12px; background: #111; border-bottom: 1px solid #222; flex-shrink: 0; }
  .header-left { display: flex; align-items: baseline; gap: 10px; }
  .panel-title { font-weight: 600; color: #a855f7; }
  .panel-sub { font-size: 0.7rem; color: #777; }
  .error, .resultado { padding: 6px 12px; font-size: 0.75rem; border-bottom: 1px solid #222; }
  .error { color: #ef4444; }
  .resultado.ok { color: #22c55e; } .resultado.error { color: #ef4444; } .resultado.info { color: #a855f7; }
  .content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 20px; }
  .seccion { display: flex; flex-direction: column; gap: 8px; }
  .seccion-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .seccion-titulo { font-size: 0.9rem; color: #ddd; margin: 0; }
  .seccion-hint { font-size: 0.7rem; color: #888; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
  .kpi { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
  .kpi-label { font-size: 0.65rem; color: #888; }
  .kpi-val { font-size: 1.4rem; font-weight: 600; color: #eee; }
  .detalle-actual { display: flex; gap: 10px; font-size: 0.8rem; background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 8px 12px; align-items: center; }
  .d-label { color: #888; } .d-val { color: #ddd; font-weight: 600; }
  .sub-titulo { font-size: 0.78rem; color: #aaa; margin: 8px 0 0; }
  .hist-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .hist-chip { font-size: 0.7rem; background: #171717; border: 1px solid #262626; color: #ccc; border-radius: 6px; padding: 4px 9px; }
  .prop-list { display: flex; flex-direction: column; gap: 6px; }
  .prop-item { display: flex; align-items: center; gap: 10px; background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 8px 10px; }
  .prop-ord { min-width: 24px; height: 24px; border-radius: 50%; background: #242424; color: #888; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; }
  .prop-ord.top { background: #a855f7; color: #fff; }
  .prop-nombre { flex: 1; font-size: 0.8rem; color: #ddd; }
  .decision-card { background: #141414; border: 1px solid #242424; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; color: #999; }
  .input { background: #151515; border: 1px solid #2a2a2a; border-radius: 6px; color: #e5e5e5; padding: 7px 9px; font-size: 0.78rem; }
  .vacio { font-size: 0.75rem; color: #666; background: #111; padding: 10px; border-radius: 6px; }
  .btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd; border-radius: 6px; padding: 8px 14px; font-size: 0.8rem; cursor: pointer; }
  .btn.small { padding: 5px 12px; font-size: 0.72rem; }
  .btn.tiny { padding: 3px 8px; font-size: 0.65rem; }
  .btn.primary { background: #a855f7; border-color: #a855f7; color: #fff; font-weight: 600; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
</style>
