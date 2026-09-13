<script lang="ts">
  /**
   * CicloImpresionPanel — la MÁQUINA DE ESTADOS del ciclo + las DOS CARAS del rol (F7, prisma-universal).
   *
   * REEMPLAZA el envoltorio genérico (BlueprintForm): panel ESPECÍFICO de ESTADO
   * con store MQTT, siguiendo el patrón de CatalogoModelosPanel / HistorialImpresionesPanel /
   * ColaImpresionPanel (4ª iteración de la práctica F7).
   *
   * SUMAR (pasada F7 trabajador): la cara del rol TRABAJADOR se SUMA a este MISMO
   * panel del jefe mediante pestañas de rol — NO se creó un panel nuevo. La
   * observación (estado + pieza + progreso + máquina visual) es COMÚN a ambos
   * (jefe_ver es COMPARTIDO en el blueprint F6½), y cada pestaña aporta SUS
   * acciones:
   *   - PESTAÑA JEFE: ▶ iniciar ciclo (la ÚNICA RPC real, onIniciarRequest → _iniciar)
   *     + las confirmaciones contextuales conservadas por compatibilidad
   *     (jefe_confirmar; en un taller de uso propio jefe=trabajador=dueño).
   *   - PESTAÑA TRABAJADOR/OPERADOR: la cara MÁS operativa del taller, quie n es
   *     quien EJECUTA las acciones físicas y VIGILA la impresora:
   *       VIGILAR — el estado de la máquina en grande (badge) + pieza en curso +
   *                 progreso %/capa (via progreso.actualizado): el operador ve
   *                 qué imprime ahora.
   *       EJECUTAR — las 3 confirmaciones contextuales según estado (las que
   *                 requieren su mano física):
   *           ESPERANDO_RETIRADA      → "✅ Pieza retirada"      (pieza_retirada)
   *           PAUSADO_FALTA_FILAMENTO → "🧵 Filamento cambiado"  (filamento_cambiado)
   *           ERROR                   → "🔁 Reanudar ciclo"      (reanudar_ciclo)
   *                 Visible SOLO en el estado correspondiente. NO hay botón
   *                 "Iniciar ciclo" en esta cara (eso es del JEFE).
   *       Las confirmaciones se emiten vía confirmarCiclo(pid, tipo) del store
   *       (publica adaptador-confirmacion.confirmacion_recibida → onConfirmacionRecibida),
   *       NO son RPC .request del módulo.
   *
   * El estado se RECONSTRUYE por las señales del orquestador (NO hay RPC lectora —
   * hueco [ABIERTO] del esquema-jefe). Confirmaciones contextuales (NO son RPC del
   * módulo): el botón según el estado emite adaptador-confirmacion.confirmacion_recibida;
   * el ciclo lo consume en onConfirmacionRecibida y aplica la transición:
   *   ESPERANDO_RETIRADA     → 🛠️ "Pieza retirada"  → IDLE (encadena siguiente)
   *   PAUSADO_FALTA_FILAMENTO → 🧵 "Filamento cambiado" → IMPRIMIENDO
   *   ERROR                  → ❌ "Reanudar ciclo"    → IDLE
   *
   * Composición:
   *   - PESTAÑAS DE ROL: "Jefe" | "Trabajador/Operador" (SUMA dentro del MISMO panel).
   *   - CABECERA: "Ciclo de impresión" + badge grande del estado actual (color=estado),
   *     alcance según pestaña activa.
   *   - OBSERVACIÓN (común): pieza en curso (via ciclo.iniciado), progreso barra % +
   *     capa actual/total (via progreso.actualizado), máquina de estados VISUAL de los
   *     8 estados (ui.estados) con el actual resaltado.
   *   - ÚLTIMA SEÑAL: actividad en vivo (qué evento llegó por el bus).
   *   - ACCIONES POR PESTAÑA: Jefe → [▶ Iniciar + botón contextual]; Trabajador →
   *     [botón contextual SOLO, sin iniciar].
   *   - ESTADOS: esperando proyecto → aviso (sin iniciar) → punto de la máquina.
   */

  import { onMount } from 'svelte';
  import {
    cicloEstado, cicloPieza, cicloProgreso, cicloError, cicloIniciando,
    puedeIniciar, confirmacionPorEstado, ultimaSenal, cicloCompletado,
    iniciarCiclo, confirmarCiclo, resetCiclo, initCicloSubscriptions,
    type EstadoCiclo, type TipoConfirmacion
  } from './stores/ciclo';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /* Pestaña de rol activa — la cara del trabajador SE SUMA a este panel (no panel nuevo). */
  let rol: 'jefe' | 'trabajador' = 'trabajador';

  /* Suscripción a las señales reconstructoras — R3, la esencia del panel. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCicloSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCiclo();
    };
  });

  // Multi-tenant: al cambiar de proyecto vaciamos la máquina (sin estado ajeno).
  $: {
    const pid = $sessionProjectId;
    if (!pid) resetCiclo();
  }

  // ---- gesto INICIAR (ROL JEFE — la ÚNICA RPC real) ----
  async function ejecutarIniciar(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    await iniciarCiclo(pid);
  }

  // ---- gesto CONFIRMAR (rol TRABAJADOR, contextual, emite adaptador-confirmacion.confirmacion_recibida) ----
  function ejecutarConfirmar(tipo: TipoConfirmacion): void {
    const pid = $sessionProjectId;
    if (!pid) return;
    confirmarCiclo(pid, tipo);
    // No hay señal .response propia: la transición se refleja en el siguiente
    // evento publicado (ciclo.iniciado/completado o progreso.actualizado). Re-lee.
  }

  // ---- Al cambiar de pestaña al trabajador, el alcance del badge refleja el rol ----
  $: alcance = rol === 'jefe'
    ? 'ver + iniciar + confirmar (jefe operador de máquina)'
    : 'VIGILAR + EJECUTAR (operador del taller · la mano en la impresora)';

  // ---- helpers de visual ----
  /** Metadatos del estado (color + icono), de ui.estados del blueprint F6½. */
  function estadoMeta(estado: EstadoCiclo): { color: string; icono: string } {
    const map: Record<EstadoCiclo, { color: string; icono: string }> = {
      IDLE:                    { color: 'st-idle',         icono: '⏸️' },
      OBTENIENDO_GCODE:        { color: 'st-blue',         icono: '⚙️' },
      SUBIENDO_GCODE:          { color: 'st-blue',         icono: '⬆️' },
      IMPRIMIENDO:             { color: 'st-imprimiendo',  icono: '🖨️' },
      ESPERANDO_RETIRADA:      { color: 'st-retirada',     icono: '🛠️' },
      PAUSADO_FALTA_FILAMENTO: { color: 'st-filamento',    icono: '🧵' },
      ERROR:                   { color: 'st-error',         icono: '❌' },
      COLA_VACIA:              { color: 'st-colavacia',     icono: '📭' }
    };
    return map[estado] || { color: '', icono: '❔' };
  }

  /** Metadatos del estado actual (color + icono) — derivado reactivo. */
  $: meta = estadoMeta($cicloEstado);

  /** Orden del flujo de los 8 estados (para la máquina visual). */
  const ORDEN_ESTADOS: EstadoCiclo[] = [
    'IDLE', 'OBTENIENDO_GCODE', 'SUBIENDO_GCODE', 'IMPRIMIENDO',
    'ESPERANDO_RETIRADA', 'PAUSADO_FALTA_FILAMENTO', 'ERROR', 'COLA_VACIA'
  ];

  /** Nodos del flujo + si tienen siguiente (para la flecha) — sin índice en each. */
  $: flujoNodos = ORDEN_ESTADOS.map((estado, i) => ({ estado, esUltimo: i === ORDEN_ESTADOS.length - 1 }));

  /** Texto + qué hace el botón de confirmación contextual para un tipo. */
  function confirmarMeta(tipo: TipoConfirmacion): { label: string; icono: string; hint: string } {
    const map: Record<TipoConfirmacion, { label: string; icono: string; hint: string }> = {
      pieza_retirada:      { label: 'Pieza retirada',        icono: '✅', hint: 'retirar de la cama → IDLE (encadena la siguiente)' },
      filamento_cambiado:  { label: 'Filamento cambiado',    icono: '🧵', hint: 'cambiar filamento → IMPRIMIENDO (reanuda)' },
      reanudar_ciclo:      { label: 'Reanudar ciclo',        icono: '🔁', hint: 'limpiar el error → IDLE (listo para re-iniciar)' }
    };
    return map[tipo];
  }

  /** Campo 'desconocido' (invariante 5) o valor real. */
  function campoValor(v: string | null | undefined): string {
    return v && v !== 'desconocido' ? v : 'desconocido';
  }
</script>

<div class="ciclo-panel" data-ciclo-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">⏱️</span>
    <span class="badge-label">Ciclo de impresión</span>
    <span class="badge-scope">MICRO-AGENTE · {alcance}</span>
    {#if $cicloIniciando}
      <span class="badge-sync">iniciando…</span>
    {/if}
  </div>

  {#if $cicloError}
    <div class="aviso-error">⚠️ {$cicloError}</div>
  {/if}

  <!-- PESTAÑAS DE ROL — la cara del trabajador SE SUMA al panel del jefe (no panel nuevo) -->
  <div class="rol-tabs" role="tablist" aria-label="cara de rol">
    <button class="rol-tab {rol === 'jefe' ? 'rol-tab-activo' : ''}" role="tab"
      aria-selected={rol === 'jefe'} on:click={() => (rol = 'jefe')}>👔 Jefe</button>
    <button class="rol-tab {rol === 'trabajador' ? 'rol-tab-activo' : ''}" role="tab"
      aria-selected={rol === 'trabajador'} on:click={() => (rol = 'trabajador')}>🛠️ Trabajador / Operador</button>
  </div>

  <!-- OBSERVACIÓN COMÚN (jefe_ver es COMPARTIDO con el trabajador en el blueprint F6½):
       estado en grande + pieza en curso + progreso %/capa + máquina visual. El VIGILAR
       del trabajador ve exactamente esto: qué imprime ahora. -->

  <!-- PUNT0 DE LA MÁQUINA (el centro del panel de estado) -->
  <div class="estado-hero">
    <span class="estado-ico">{meta.icono}</span>
    <div class="estado-bloque">
      <div class="estado-tag">estado actual</div>
      <div class="estado-nombre {meta.color}">
        <span class="chip-estado {meta.color}">{$cicloEstado}</span>
      </div>
    </div>
  </div>

  <!-- PIEZA EN CURSO + PROGRESO -->
  {#if $cicloPieza}
    <div class="pieza">
      <div class="pieza-nombre">🧊 {$cicloPieza.nombre}</div>
      <div class="pieza-meta">
        <span class="chip-chip">🧵 {campoValor($cicloPieza.material)}</span>
        <span class="chip-chip">🔖 {campoValor($cicloPieza.modelo_id)}</span>
      </div>
      {#if $cicloProgreso}
        <div class="progreso" title="capa {$cicloProgreso.current_layer ?? '—'}/{$cicloProgreso.total_layer ?? '—'}">
          <div class="barra">
            <div class="barra-fill" style="width: {Math.min(100, Math.max(0, $cicloProgreso.progress))}%" />
          </div>
          <div class="progreso-txt">{Math.round($cicloProgreso.progress)}%
            {#if $cicloProgreso.current_layer != null && $cicloProgreso.total_layer != null}
              · capa {$cicloProgreso.current_layer}/{$cicloProgreso.total_layer}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- AVISO DE CICLO COMPLETADO -->
  {#if $cicloCompletado}
    <div class="aviso-ok">🎉 ciclo completado — la impresora quedó ociosa con causa (cola retirada)</div>
  {/if}

  <!-- MÁQUINA DE ESTADOS VISUAL (flujo de los 8 estados, resalta el actual) -->
  <div class="maquina">
    <div class="maquina-titulo">máquina de estados</div>
    <ol class="flujo">
      {#each flujoNodos as nodo (nodo.estado)}
        {@const estado = nodo.estado}
        {@const m = estadoMeta(estado)}
        {@const activo = estado === $cicloEstado}
        <li class="nodo {activo ? 'nodo-activo' : ''}">
          <span class="nodo-ico" title={estado}>{m.icono}</span>
          <span class="nodo-nombre {m.color} {activo ? 'nodo-on' : 'nodo-off'}">{estado}</span>
          {#if !nodo.esUltimo}
            <span class="nodo-flecha">→</span>
          {/if}
        </li>
      {/each}
    </ol>
    <div class="maquina-leyenda">
      estados con «tu mano hace falta»: ✅ retirar · 🧵 filamento · 🔁 reanudar
    </div>
  </div>

  <!-- ÚLTIMA SEÑAL (actividad en vivo del bus) -->
  {#if $ultimaSenal}
    <div class="senal" title="actividad en vivo del bus">
      <span class="senal-evento">📡 {$ultimaSenal.evento}</span>
      <span class="senal-cuando">{new Date($ultimaSenal.cuando).toLocaleTimeString()}</span>
    </div>
  {/if}

  <!-- ACCIONES POR PESTAÑA -->

  <!-- CARA TRABAJADOR (la PRINCIPAL): controla TODO el proceso productivo/creativo — inicia + ejecuta confirmaciones -->
  {#if rol === 'trabajador'}
    <div class="gestos">
      {#if $puedeIniciar}
        <button class="btn-jefe" disabled={$cicloIniciando} on:click={ejecutarIniciar}
          title="el trabajador controla el proceso de producción (ciclo.iniciar.request → ciclo.iniciado; una pieza a la vez)">
          {$cicloIniciando ? '⏳ iniciando…' : '▶ Iniciar ciclo (producir)'}
        </button>
      {/if}

      {#if $confirmacionPorEstado}
        {@const c = confirmarMeta($confirmacionPorEstado)}
        <button class="btn-confirmar btn-worker" on:click={() => ejecutarConfirmar($confirmacionPorEstado!)}>
          {c.icono} {c.label}
        </button>
        <div class="confirmar-hint">{c.hint} <em>· no es RPC: va por adaptador-confirmacion</em></div>
      {:else}
        <div class="worker-espera">👀 produciendo — el estado del ciclo se vigila; no hay ninguna acción física pendiente</div>
      {/if}
    </div>
  {/if}

  <!-- CARA JEFE: ve RESULTADOS / visión de conjunto — SOLO vigilancia, sin operar producción -->
  {#if rol === 'jefe'}
    <div class="gestos">
      <div class="jefe-ver">📊 Visión de conjunto: el jefe observa el estado del ciclo y los resultados. No arranca producción ni confirma transiciones físicas — eso es del trabajador que controla el proceso.</div>
    </div>
  {/if}

  <div class="pie-hint">
    es un panel de ESTADO: la vista se reconstruye por las señales del orquestador, nunca recarga · el TRABAJADOR controla el proceso (inicia y confirma retirar/filamento/reanudar) · el JEFE ve el conjunto y los resultados
  </div>
</div>

<style>
  .ciclo-panel { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.5rem; }
  .actor-badge { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.7rem; margin-bottom: 0.25rem; font-size: 0.7rem; border-bottom: 1px solid var(--color-border, #333); }
  .badge-icon { font-size: 0.85rem; }
  .badge-label { font-weight: 700; color: var(--color-primary, #eab308); text-transform: uppercase; letter-spacing: 0.05em; }
  .badge-scope { color: var(--color-text-muted, #888); font-size: 0.65rem; }
  .badge-sync { margin-left: auto; color: var(--color-primary, #eab308); font-size: 0.65rem; }

  .rol-tabs { display: flex; gap: 0.35rem; padding: 0.15rem; background: var(--color-surface, #1a1a1a); border: 1px solid var(--color-border, #333); border-radius: 8px; }
  .rol-tab { font-size: 0.72rem; flex: 1; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid transparent; cursor: pointer; background: transparent; color: var(--color-text-muted, #888); font-weight: 600; }
  .rol-tab-activo { background: rgba(234,179,8,0.14); color: var(--color-primary, #eab308); border-color: rgba(234,179,8,0.35); }

  .aviso-error { font-size: 0.75rem; color: #ef4444; padding: 0.4rem 0.7rem; background: rgba(239,68,68,0.08); border-radius: 6px; border: 1px solid rgba(239,68,68,0.25); }
  .aviso-ok { font-size: 0.75rem; color: #22c55e; padding: 0.4rem 0.7rem; background: rgba(34,197,94,0.08); border-radius: 6px; border: 1px solid rgba(34,197,94,0.25); }

  .estado-hero { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem; background: var(--color-surface, #1a1a1a); border: 1px solid var(--color-border, #333); border-radius: 10px; }
  .estado-ico { font-size: 1.9rem; }
  .estado-bloque { display: flex; flex-direction: column; gap: 0.1rem; }
  .estado-tag { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted, #888); }
  .estado-nombre { display: flex; align-items: center; }

  .chip-estado { font-size: 0.95rem; padding: 0.12rem 0.8rem; border-radius: 999px; font-weight: 800; letter-spacing: 0.03em; }
  .st-idle { color: #a3a3a3; background: rgba(163,163,163,0.16); }
  .st-blue { color: #60a5fa; background: rgba(96,165,250,0.16); }
  .st-imprimiendo { color: #f59e0b; background: rgba(245,158,11,0.16); }
  .st-retirada { color: #facc15; background: rgba(250,204,21,0.16); }
  .st-filamento { color: #c084fc; background: rgba(192,132,252,0.16); }
  .st-error { color: #ef4444; background: rgba(239,68,68,0.16); }
  .st-colavacia { color: #22d3ee; background: rgba(34,211,238,0.16); }

  .pieza { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem 0.7rem; background: var(--color-surface, #1a1a1a); border: 1px solid var(--color-border, #333); border-radius: 8px; }
  .pieza-nombre { font-weight: 600; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.3rem; }
  .pieza-meta { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .chip-chip { font-size: 0.66rem; padding: 0.05rem 0.45rem; border-radius: 999px; background: rgba(163,163,163,0.14); color: inherit; }
  .progreso { display: flex; align-items: center; gap: 0.5rem; }
  .barra { flex: 1; height: 8px; background: rgba(163,163,163,0.18); border-radius: 999px; overflow: hidden; }
  .barra-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #f59e0b); border-radius: 999px; transition: width 0.4s ease; }
  .progreso-txt { font-size: 0.7rem; font-weight: 700; }

  .maquina { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem 0.7rem; border: 1px solid var(--color-border, #333); border-radius: 8px; }
  .maquina-titulo { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted, #888); }
  .flujo { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 0.15rem; }
  .nodo { display: inline-flex; align-items: center; gap: 0.2rem; }
  .nodo-ico { font-size: 0.85rem; opacity: 0.75; }
  .nodo-nombre { font-size: 0.62rem; font-weight: 700; padding: 0.08rem 0.5rem; border-radius: 999px; }
  .nodo-on { box-shadow: 0 0 0 2px currentColor; }
  .nodo-off { opacity: 0.35; }
  .nodo-flecha { color: var(--color-text-muted, #666); font-size: 0.65rem; }
  .maquina-leyenda { font-size: 0.6rem; color: var(--color-text-muted, #888); }

  .senal { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.68rem; padding: 0.3rem 0.7rem; border-radius: 6px; color: #22c55e; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); }
  .senal-evento { font-weight: 600; }
  .senal-cuando { color: var(--color-text-muted, #888); }

  .gestos { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
  .btn-jefe { font-size: 0.82rem; padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid transparent; cursor: pointer; background: var(--color-primary, #eab308); color: #111; font-weight: 700; }
  .btn-jefe:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-confirmar { font-size: 0.82rem; padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid var(--color-primary, #eab308); cursor: pointer; background: transparent; color: var(--color-primary, #eab308); font-weight: 700; }
  .btn-confirmar:hover { background: rgba(234,179,8,0.12); }
  .btn-worker { border-color: #22c55e; color: #22c55e; }
  .btn-worker:hover { background: rgba(34,197,94,0.12); }
  .confirmar-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); }
  .confirmar-hint em { font-style: normal; color: #f59e0b; }
  .worker-espera { font-size: 0.68rem; color: var(--color-text-muted, #888); font-style: italic; }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }
</style>
