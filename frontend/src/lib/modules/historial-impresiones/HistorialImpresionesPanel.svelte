<script lang="ts">
  /**
   * HistorialImpresionesPanel — la CINTA CRONOLÓGICA del historial de impresiones (F7, prisma-universal).
   *
   * REEMPLAZA el envoltorio genérico (BlueprintForm): panel ESPECÍFICO con store MQTT,
   * siguiendo el patrón de CatalogoModelosPanel (modules/catalogo-modelos, 2ª iteración
   * de la práctica F7).
   *
   * F7 ROL TRABAJADOR (SUMAR, no duplicar): una segunda pestaña del MISMO panel — "Trabajador"
   * — con la cara del OPERADOR del taller (esquema-trabajador F6, #573), un LECTOR de la MISMA
   * cinta (listar COMPARTIDA jefe+trabajador, blueprint F6½ #574). El trabajador NO escribe:
   * el registro entra solo por `impresion.completada` (sistema) o RPC de ciclo-impresion.
   * Lo que cambia es el FOCO (presentacional): el jefe mira la cinta con foco de GESTIÓN
   * (memoria del taller, panorama), el trabajador con foco OPERATIVO (qué salió BIEN/MAL,
   * cuánto gastó cada pieza) + un RESUMEN RÁPIDO derivado del store (completadas · fallidas ·
   * total de filamento) para saber cómo va el taller en un vistazo.
   *
   * MATIZ CLAVE — el jefe (y el trabajador) es LECTOR, NO escritor: a diferencia de
   * catalogo-modelos (donde el jefe registra modelos), aquí el REGISTRO llega automáticamente
   * por el evento `impresion.completada` (onImpresionCompletada, fire-and-forget) o por RPC de
   * ciclo-impresion. El jefe SOLO consulta el historial. Por eso el panel NO tiene botón
   * de alta: es una CINTA CRONOLÓGICA de impresiones pasadas. La señal pareada
   * `historial.impresion_registrada` (escritura del sistema) refresca la cinta en vivo,
   * sin recargar (R3) — AMBAS pestañas beben del MISMO store.
   *
   * Composición (esquema-jefe rol JEFE + esquema-trabajador rol TRABAJADOR):
   *   - PESTAÑAS de rol: "Jefe" (cinta completa con foco gestión, ya existente) + "Trabajador"
   *     (la MISMA cinta con foco operativo: resultado ✅/❌ y gasto + resumen rápidp).
   *   - CABECERA de pulso (total): "n registros en total" vía listar → total.
   *   - CINTA cronológica (listar): tarjetas/filas por impresión, más reciente primero.
   *     Cada entrada: fecha · modelo (id/nombre) · material · filamento · tiempo · resultado.
   *     Huecos mostrados como "desconocido" (invariante 5: dato ausente nombrado, nunca inventado).
   *   - Cara TRABAJADOR: resumen operativo (completadas ✅ · fallidas ❌ · total filamento) +
   *     cinta de resultados con el resultado destacado por color y el gasto (filamento/tiempo)
   *     resaltado. SIN gesto de escritura.
   *   - Estados: cargando → vacío (sin impresiones registradas aún — el ciclo de impresión
   *     las registrará) → con datos.
   *   - REFRESCO automático por la señal historial.impresion_registrada (sin botón de
   *     recargar: la vista re-lee, nunca recarga).
   *
   * Lenguaje visual: color=estado (resultado: completada/ok verde, fallo/cancelado rojo,
   * desconocido gris), icono=entidad (🖨️/cinta), texto=precisión. Los 3 canales refuerzan
   * el mismo mensaje.
   */

  import { onMount } from 'svelte';
  import {
    registros,
    historialLoading,
    historialError,
    totalRegistros,
    ultimoRegistrado,
    loadHistorial,
    resetHistorial,
    initHistorialSubscriptions,
    describeError,
    type RegistroHistorial
  } from './stores/historial';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /* Suscripción a la señal pareada — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initHistorialSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetHistorial();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadHistorial(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetHistorial();
    }
  }

  // ---- PESTAÑA DE ROL (Jefe | Trabajador): la cara del TRABAJADOR se SUMA al panel (F7) ----
  // Convención prisma-universal: SUMAR, nunca reemplazar ni duplicar. Un solo panel con la
  // cara del jefe (foco gestión) + la del trabajador (foco operativo sobre la MISMA cinta).
  let rolActivo: 'jefe' | 'trabajador' = 'jefe';

  // ---- Derivados de la cara TRABAJADOR (operativo sobre la MISMA cinta, esquema-trabajador F6) ----
  // El operador quiere saber en un vistazo cómo va el taller: qué salió bien/mal y cuánto gastó.
  function esCompletada(r: RegistroHistorial): boolean {
    const v = (r.resultado || '').toLowerCase();
    return ['completada', 'ok', 'completado', 'exito'].includes(v);
  }
  function esFallida(r: RegistroHistorial): boolean {
    const v = (r.resultado || '').toLowerCase();
    return ['fallo', 'fallida', 'fallido', 'error', 'cancelada', 'cancelado', 'no'].includes(v);
  }

  /** Cuántas impresiones completadas (resultado ok). */
  $: completadas = $registros.filter(esCompletada).length;
  /** Cuántas fallidas (resultado fallo). */
  $: fallidas = $registros.filter(esFallida).length;
  /** Total de filamento usado (suma solo valores numéricos; huecos 'desconocido' no cuentan). */
  $: filamentoTotal = $registros.reduce((acc, r) => {
    const n = parseFloat(String(r.filamento_usado ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
  /** ¿Hay alguna cifra de gasto que mostrar en el resumen? (si todo es desconocido o 0 → ocultar). */
  $: hayGasto = filamentoTotal > 0 || $registros.some((r) => !esFallida(r) && r.filamento_usado && r.filamento_usado !== 'desconocido');

  /** DD/MM/YYYY HH:MM (es-ES) de un ISO; 'desconocido' si no hay fecha válida. */
  function fechacorta(iso: string | null | undefined): string {
    if (!iso) return 'desconocido';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'desconocido';
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  /** Rotula un hueco 'desconocido' (invariante 5) o devuelve el valor real. */
  function campoValor(v: string | null | undefined): string {
    return v && v !== 'desconocido' ? v : 'desconocido';
  }

  /** Badge de resultado: color=estado. 'completada'/'ok' → verde · fallo → rojo · resto gris. */
  function resultadoClase(resultado: string | null | undefined): string {
    const r = (resultado || '').toLowerCase();
    if (['completada', 'ok', 'completado', 'exito', 'exito'].includes(r)) return 'res-ok';
    if (['fallo', 'fallida', 'fallido', 'error', 'cancelada', 'cancelado', 'no'].includes(r)) return 'res-fallo';
    return 'res-desc';
  }

  /** Icono de resultado para la cara operativa del trabajador: ✅ / ❌ / ⚪. */
  function resultadoIcono(resultado: string | null | undefined): string {
    if (esCompletada({ resultado: resultado ?? '' } as RegistroHistorial)) return '✅';
    if (esFallida({ resultado: resultado ?? '' } as RegistroHistorial)) return '❌';
    return '⚪';
  }
</script>

<div class="historial-panel" data-historial-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">🖨️</span>
    <span class="badge-label">Historial de impresiones</span>
    <span class="badge-scope">CUSTODIO · jefe + trabajador LECTORES · el registro llega solo por impresion.completada</span>
  </div>

  <!-- PESTAÑAS DE ROL: la cara del TRABAJADOR se SUMA al panel del JEFE (F7 sumar, no duplicar) -->
  <div class="rol-tabs" role="tablist">
    <button
      class:rol-tab-activa={rolActivo === 'jefe'}
      class="rol-tab"
      class:rol-tab-jefe
      role="tab"
      aria-selected={rolActivo === 'jefe'}
      on:click={() => (rolActivo = 'jefe')}
      title="jefe: la cinta de gestión — ver la memoria del taller y el total (foco panorama)">👨‍💼 Jefe</button>
    <button
      class:rol-tab-activa={rolActivo === 'trabajador'}
      class="rol-tab"
      class:rol-tab-worker
      role="tab"
      aria-selected={rolActivo === 'trabajador'}
      on:click={() => (rolActivo = 'trabajador')}
      title="trabajador: la cinta de resultados con foco operativo — qué salió bien/mal y cuánto gastó (lectura pura)">🧑‍🔧 Trabajador</button>
  </div>

  {#if rolActivo === 'jefe'}
  {#if $historialError}
    <div class="cinta-error">⚠️ {$historialError}</div>
  {/if}

  <!-- CABECERA: pulso total (listar → total) -->
  <div class="cabecera">
    <span class="pulso">🖨️ {$totalRegistros} impresiones</span>
    <span class="pulso-hint">memoria del taller · append-only</span>
  </div>

  {#if $ultimoRegistrado}
    <div class="senal-confirmacion">
      🆕 registrada <strong>{campoValor($ultimoRegistrado.modelo_nombre)}</strong> · la cinta se refrescó sola
    </div>
  {/if}

  <!-- CINTA CRONOLÓGICA (listar, más reciente primero) -->
  {#if $historialLoading && $registros.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🖨️</div>
      <div class="vacio-txt">cargando historial…</div>
    </div>
  {:else if $registros.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🧭</div>
      <div class="vacio-txt">sin impresiones registradas aún — el ciclo de impresión las registrará por evento</div>
      <div class="vacio-sub">cuando una impresión se complete aparecerá aquí arriba, sin recargar</div>
    </div>
  {:else}
    <ol class="cinta">
      {#each $registros as reg (reg.id)}
        <li class="fila">
          <div class="fila-fecha">
            <span class="fecha-ico">📅</span>
            <span>{fechacorta(reg.fecha ?? reg.registrado_en)}</span>
          </div>
          <div class="fila-cuerpo">
            <div class="fila-encabezado">
              <span class="fila-nombre" title="modelo_id: {reg.modelo_id}">🧊 {campoValor(reg.modelo_nombre)}</span>
              <span class="chip-res {resultadoClase(reg.resultado)}">{campoValor(reg.resultado)}</span>
            </div>
            <div class="fila-meta">
              <span class="chip-chip">🧵 {campoValor(reg.material)}</span>
              <span class="chip-chip">🪡 {campoValor(reg.filamento_usado)}</span>
              <span class="chip-chip">⏱ {campoValor(reg.tiempo)}</span>
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
  {/if}

  <!-- ===== CARA DEL TRABAJADOR (LECTOR / OPERATIVO) — se SUMA al panel del jefe ===== -->
  {#if rolActivo === 'trabajador'}
  <div class="worker-view" data-rol="trabajador">
    {#if $historialError}
      <div class="cinta-error">⚠️ {$historialError}</div>
    {/if}

    {#if $ultimoRegistrado}
      <div class="senal-confirmacion">
        🆕 registrada <strong>{campoValor($ultimoRegistrado.modelo_nombre)}</strong> · la cinta de resultados se refrescó sola
      </div>
    {/if}

    <!-- VIGILAR 1 · resumen operativo del taller (derivado del MISMO store) -->
    {#if $registros.length > 0}
      <div class="worker-cabecera">
        <span class="worker-titulo">🔎 Cómo va el taller</span>
        <div class="worker-resumen">
          <span class="res-kpi res-kpi-ok" title="impresiones completadas">✅ {completadas} completadas</span>
          <span class="res-kpi res-kpi-fallo" title="impresiones fallidas">❌ {fallidas} fallidas</span>
          {#if hayGasto}
            <span class="res-kpi res-kpi-gasto" title="filamento total usado en el historial (suma de valores numéricos; huecos 'desconocido' no cuentan)">🪡 {filamentoTotal.toFixed(2)} g</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- VIGILAR 2 · cinta de RESULTADOS (MISMO listar) con foco operativo -->
    {#if $historialLoading && $registros.length === 0}
      <div class="vacio">
        <div class="vacio-ico">🖨️</div>
        <div class="vacio-txt">cargando historial…</div>
      </div>
    {:else if $registros.length === 0}
      <div class="vacio">
        <div class="vacio-ico">🧭</div>
        <div class="vacio-txt">aún no hay impresiones registradas — el ciclo de impresión las registrará por evento</div>
        <div class="vacio-sub">cuando una impresión se complete aparecerá aquí arriba, sin recargar</div>
      </div>
    {:else}
      <div class="worker-cabecera cinta-ops">
        <span class="worker-titulo">🖨️ Cinta de resultados — qué salió bien/mal</span>
        <span class="pulso-total" title="total de impresiones en el historial">🧮 {$totalRegistros} en total</span>
      </div>
      <ol class="cinta">
        {#each $registros as reg (reg.id)}
          <li class="fila cinta-op-fila {resultadoClase(reg.resultado)}">
            <div class="fila-fecha">
              <span class="fecha-ico">📅</span>
              <span>{fechacorta(reg.fecha ?? reg.registrado_en)}</span>
            </div>
            <div class="fila-cuerpo">
              <div class="fila-encabezado op-encabezado">
                <span class="op-resultado res-emoji {resultadoClase(reg.resultado)}">{resultadoIcono(reg.resultado)}</span>
                <span class="fila-nombre" title="modelo_id: {reg.modelo_id}">🧊 {campoValor(reg.modelo_nombre)}</span>
                <span class="chip-res {resultadoClase(reg.resultado)}">{campoValor(reg.resultado)}</span>
              </div>
              <div class="fila-meta">
                <span class="chip-chip">🧵 {campoValor(reg.material)}</span>
                <span class="chip-chip op-gasto">🪡 {campoValor(reg.filamento_usado)} usado</span>
                <span class="chip-chip op-gasto">⏱ {campoValor(reg.tiempo)}</span>
              </div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="pie-hint">el trabajador NO registra: la cinta de resultados crece sola por el evento impresion.completada (refresco por señal, sin recargar) · mira qué salió bien/mal y cuánto gastó cada pieza</div>
  </div>
  {/if}
</div>

<style>
  .historial-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.5rem;
  }
  .actor-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    margin-bottom: 0.25rem;
    font-size: 0.7rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .badge-icon { font-size: 0.85rem; }
  .badge-label {
    font-weight: 700;
    color: var(--color-primary, #eab308);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-scope { color: var(--color-text-muted, #888); font-size: 0.65rem; }

  /* --- pestañas de rol (jefe | trabajador) --- */
  .rol-tabs {
    display: flex;
    gap: 0.4rem;
    padding: 0.15rem 0.2rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .rol-tab {
    border: 1px solid var(--color-border, #333);
    background: transparent;
    color: var(--color-text-muted, #888);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.3rem 0.8rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .rol-tab:hover { color: var(--color-text, #eee); border-color: var(--color-border-strong, #555); }
  .rol-tab-activa.rol-tab-jefe {
    color: #60a5fa;
    border-color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
  }
  .rol-tab-activa.rol-tab-worker {
    color: #a78bfa;
    border-color: #a78bfa;
    background: rgba(167, 139, 250, 0.12);
  }

  .cinta-error { font-size: 0.75rem; color: #ef4444; padding: 0.3rem 0.7rem; }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .pulso {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
  }
  .pulso-hint { font-size: 0.65rem; color: var(--color-text-muted, #888); margin-left: auto; }
  .pulso-total {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.7rem;
    color: #a3a3a3;
    background: rgba(163, 163, 163, 0.14);
    margin-left: auto;
  }
  .senal-confirmacion {
    font-size: 0.72rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 140px;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    text-align: center;
  }
  .vacio-ico { font-size: 2rem; }
  .vacio-sub { font-size: 0.7rem; opacity: 0.8; }
  .cinta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .fila {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 0.6rem;
    align-items: center;
    padding: 0.55rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .fila-fecha {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--color-text-muted, #aaa);
    font-size: 0.7rem;
  }
  .fecha-ico { opacity: 0.7; }
  .fila-cuerpo { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .fila-encabezado { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .fila-nombre { font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila-meta { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip-chip {
    font-size: 0.66rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: rgba(163, 163, 163, 0.14);
    color: inherit;
  }
  .chip-res {
    font-size: 0.66rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .res-ok { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
  .res-fallo { color: #ef4444; background: rgba(239, 68, 68, 0.14); }
  .res-desc { color: #a3a3a3; background: rgba(163, 163, 163, 0.14); }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }

  /* --- cara TRABAJADOR (operativa sobre la MISMA cinta) --- */
  .worker-view {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.15rem 0.2rem;
  }
  .worker-cabecera {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .cinta-ops { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
  .cinta-ops .worker-titulo { margin-right: auto; }
  .worker-titulo { font-size: 0.72rem; font-weight: 700; color: var(--color-text, #eee); text-transform: uppercase; letter-spacing: 0.03em; }
  .worker-resumen { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .res-kpi {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.72rem;
  }
  .res-kpi-ok { color: #22c55e; background: rgba(34, 197, 94, 0.12); }
  .res-kpi-fallo { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
  .res-kpi-gasto { color: #60a5fa; background: rgba(96, 165, 250, 0.12); }

  /* Filas de la cinta operativa: el borde y el emoji del resultado refuerzan el estado */
  .cinta-op-fila { border-left: 3px solid transparent; }
  .cinta-op-fila.res-ok { border-left-color: #22c55e; }
  .cinta-op-fila.res-fallo { border-left-color: #ef4444; }
  .cinta-op-fila.res-desc { border-left-color: #a3a3a3; }
  .op-encabezado { gap: 0.45rem; }
  .op-resultado { font-size: 0.95rem; line-height: 1; }
  .op-gasto { font-weight: 600; }
</style>
