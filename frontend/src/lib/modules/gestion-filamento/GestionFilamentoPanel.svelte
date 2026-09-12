<script lang="ts">
  /**
   * GestionFilamentoPanel — la CINTA DEL STOCK del taller 3D (F7, prisma-universal).
   *
   * CASO ESPECIAL — NO existía panel previo: gestion-filamento llegó solo a F6
   * (esquema-jefe + esquema-trabajador, PR #576) y F6½ (blueprint, PR #577), sin F7.
   * Este F7 CREA el panel desde cero con pestañas trabajador + jefe (no se suma
   * sobre uno existente). Un solo GestionFilamentoPanel.svelte con store MQTT propio.
   *
   * Es el CUSTODIO del stock de filamento por LONGITUD (mm): registrar (alta de
   * rollo, JEFE) es la ÚNICA escritura del módulo; listar (cinta del stock) es la
   * cara de LECTURA que alimenta a AMBOS roles.
   *
   * DUALIDAD DE ROLES (esquemas F6 + blueprint F6½):
   *   - TRABAJADOR/operador (LECTOR casi puro): VIGILA el stock del taller (listar)
   *     para operar la impresora y tener material a mano — qué rollos hay, cuánto
   *     queda del activo, cuál está por agotarse (bajo <= 5000mm) y cuál es el que
   *     gasta la máquina (activo). Sin gestos de escritura: NO registra (JEFE), NO
   *     decrementa (impresora). Su operación física del cambio de rollo vive en
   *     ciclo-impresion, no aquí.
   *   - JEFE/dueño: lista (cinta del stock para decidir si repone) + registra
   *     (alta de rollo: tipo, color, longitud inicial + toggle 'activo'). La única
   *     escritura del custodio, exclusiva del jefe.
   *   - NEUTRO: decrementar vive en el SISTEMA (la impresora reporta filamento.usado
   *     contra el rollo activo); el panel solo se REFRESCA con filamento.decrementado/
   *     filamento.bajo, nunca lo dispara.
   *   - 'activar rollo' (marcar activo) es [ABIERTO]: hoy `activo` solo se fija como
   *     toggle de registrar, SIN RPC dedicado onMarcarActivo. La marca del activo se
   *     hace en el alta del jefe, no se inventa un gesto nuevo.
   *
   * Composición:
   *   - CABECERA de pulso (listar): n rollos · m bajo umbral · cuál está activo.
   *   - CINTA del stock (listar): tarjetas con tipo, color, longitud restante +
   *     badge "activo" (🖨️ cargado) y badge "bajo" (⚠️ ten repuesto a mano).
   *     Color=estado: normal 🟦 · bajo ⚠️ · activo 🖨️ (del blueprint ui.estados).
   *   - Pestaña TRABAJADOR: la cinta completa (LECTOR) SIN botón de alta.
   *   - Pestaña JEFE: la misma cinta + botón "Registrar rollo" (modal alta).
   *   - Estados: cargando → vacío ("no hay rollos") → datos.
   *   - REFRESCO EN VIVO: filamento.registrado / filamento.decrementado /
   *     filamento.bajo re-leen la cinta sin recargar (R3).
   */

  import { onMount } from 'svelte';
  import {
    rollosFilamento,
    filamentoLoading,
    filamentoError,
    ultimaAccion,
    totalRollos,
    rollosBajos,
    rolloActivo,
    listarRollos,
    resetFilamento,
    initFilamentoSubscriptions,
    registrarRollo,
    describeError,
    type RolloFilamento
  } from './stores/filamento';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- modal de alta (+ rollo) — ROL JEFE ----
  let altaAbierta = false;
  let altaBusy = false;
  let altaError: string | null = null;
  let altaTipo = '';
  let altaColor = '';
  let altaLongitudStr = '';
  let altaActivo = false;

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initFilamentoSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetFilamento();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void listarRollos(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetFilamento();
    }
  }

  // ---- pestaña de rol (Trabajador | Jefe) — la cara del jefe y del trabajador
  // comparten el MISMO store; la distinción es de gestos (solo el jefe registra).
  let rolActivo: 'trabajador' | 'jefe' = 'trabajador';

  // El trabajador es LECTOR casi puro: solo ve la cinta derivada del MISMO store.

  // ---- gesto REGISTRAR (solo pestaña JEFE) ----
  function abrirAlta(): void {
    altaAbierta = true;
    altaBusy = false;
    altaError = null;
    altaTipo = '';
    altaColor = '';
    altaLongitudStr = '';
    altaActivo = false;
  }
  function cerrarAlta(): void {
    if (altaBusy) return;
    altaAbierta = false;
  }
  async function ejecutarAlta(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    if (!altaTipo.trim()) {
      altaError = 'tipo es obligatorio';
      return;
    }
    altaBusy = true;
    altaError = null;
    try {
      await registrarRollo(pid, {
        tipo: altaTipo.trim(),
        color: altaColor.trim() || undefined,
        // Si el número no es > 0, el módulo lo deja null (longitud desconocida, no decrementable).
        longitud_inicial: altaLongitudStr.trim() ? Number(altaLongitudStr) : undefined,
        activo: altaActivo
      });
      altaAbierta = false; // la señal filamento.registrado re-lee la cinta (R3)
    } catch (err) {
      altaError = describeError(err);
    } finally {
      altaBusy = false;
    }
  }

  // ---- helpers de visual ----
  /** Etiqueta de estado derivada (color=estado del blueprint ui.estados). */
  function estadoRollo(r: RolloFilamento): string {
    if (r.activo) return '🖨️ activo';
    if (r.bajo) return '⚠️ bajo';
    return '🟦 normal';
  }
  function estadoCls(r: RolloFilamento): string {
    if (r.activo) return 'st-activo';
    if (r.bajo) return 'st-bajo';
    return 'st-normal';
  }
  /** Longitud mostrada con honestidad: 'desconocida' si null (Invariante 9). */
  function mm(v: number | null | undefined): string {
    return typeof v === 'number' ? `${v.toLocaleString('es')} mm` : 'desconocida';
  }
</script>

<div class="filamento-panel" data-filamento-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">🧵</span>
    <span class="badge-label">Stock de filamento</span>
    <span class="badge-scope">CUSTODIO · trabajador LECTOR del stock · jefe registra rollos</span>
  </div>

  <!-- PESTAÑAS DE ROL: cara del TRABAJADOR (LECTOR, la principal) + cara del JEFE (alta) -->
  <div class="rol-tabs" role="tablist">
    <button
      class:rol-tab-activa={rolActivo === 'trabajador'}
      class="rol-tab"
      class:rol-tab-worker
      role="tab"
      aria-selected={rolActivo === 'trabajador'}
      on:click={() => (rolActivo = 'trabajador')}
      title="trabajador: vigilar el stock para operar la impresora (lectura pura)">🧑‍🔧 Trabajador</button>
    <button
      class:rol-tab-activa={rolActivo === 'jefe'}
      class="rol-tab"
      class:rol-tab-jefe
      role="tab"
      aria-selected={rolActivo === 'jefe'}
      on:click={() => (rolActivo = 'jefe')}
      title="jefe: registrar rollos nuevos + ver el stock para reponer">👨‍🔧 Jefe</button>
  </div>

  {#if $filamentoError}
    <div class="cinta-error">⚠️ {$filamentoError}</div>
  {/if}

  <!-- CABECERA DE PULSO: n rollos · m bajo · cuál activo -->
  <div class="cabecera">
    <span class="pulso" title="rollos en el stock">🧵 {$totalRollos} rollos</span>
    <span class="pulso-bajo" title="rollos por debajo del umbral (<=5000mm) — ten repuesto a mano">
      ⚠️ {$rollosBajos} bajo umbral
    </span>
    {#if $rolloActivo && $rolloActivo.tipo}
      <span class="badge-activo" title="rollo cargado en la impresora — el que gasta la máquina">
        🖨️ activo: {$rolloActivo.tipo}{#if $rolloActivo.color && $rolloActivo.color !== 'desconocido'} · {$rolloActivo.color}{/if}
      </span>
    {:else}
      <span class="badge-inactivo" title="ningún rollo marcado como activo (se marca en el alta del jefe)">🖨️ sin activo</span>
    {/if}
    {#if rolActivo === 'jefe'}
      <button class="btn-jefe" on:click={abrirAlta} title="dar de alta un rollo (filamento.registrar → filamento.registrado)">➕ Rollo</button>
    {/if}
  </div>

  {#if $ultimaAccion}
    <div class="senal-confirmacion">
      🆕 registraste <strong>{$ultimaAccion.rollo}</strong> · la cinta se refrescó sola
    </div>
  {/if}

  <!-- CINTA DEL STOCK (listar → el stock del taller) -->
  {#if $filamentoLoading && $rollosFilamento.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🧵</div>
      <div class="vacio-txt">cargando el stock…</div>
    </div>
  {:else if $rollosFilamento.length === 0}
    <div class="vacio">
      <div class="vacio-ico">🫙</div>
      <div class="vacio-txt">no hay rollos registrados en este taller</div>
      {#if rolActivo === 'jefe'}
        <button class="btn-neutro" on:click={abrirAlta}>➕ Registrar primer rollo</button>
      {/if}
    </div>
  {:else}
    <ol class="cinta">
      {#each $rollosFilamento as rollo (rollo.id)}
        <li class="fila {estadoCls(rollo)}">
          <div class="fila-cuerpo">
            <div class="fila-encabezado">
              <span class="fila-nombre" title="id: {rollo.id}">🧵 {rollo.tipo}</span>
              {#if rollo.color && rollo.color !== 'desconocido'}
                <span class="chip-chip" title="color">🎨 {rollo.color}</span>
              {/if}
              <span class="chip-estado {estadoCls(rollo)}">{estadoRollo(rollo)}</span>
            </div>
            <div class="fila-meta">
              <span class="chip-chip" title="longitud restante">📏 restante: {mm(rollo.longitud_restante)}</span>
              <span class="chip-chip" title="longitud inicial">🏷️ inicial: {mm(rollo.longitud_inicial)}</span>
              {#if rollo.bajo}
                <span class="chip-bajo" title="ten repuesto a mano (<= 5000mm)">⚠️ prepara repuesto</span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="pie-hint">
    {#if rolActivo === 'trabajador'}
      👉 el trabajador VIGILA el stock (lista · pulso) para operar la impresora y tener material/reparto a mano — no registra, no decrementa (esos son del JEFE / de la impresora). La cinta se refresca sola por señal (filamento.registrado / decrementado / bajo).
    {:else}
      👉 el dueño ve el stock para decidir si repone y registra rollos (alta con tipo, color, longitud inicial + toggle activo). El decremento lo hace la impresora por evento; el activo se marca aquí en el alta [ABIERTO: sin RPC de 'marcar activo'].
    {/if}
  </div>

  <!-- MODAL DE ALTA (registrar, ROL JEFE — editor-bloque) -->
  {#if altaAbierta}
    <div class="overlay" on:click={cerrarAlta}>
      <div class="panel" on:click|stopPropagation>
        <h3 class="panel-titulo">➕ Registrar rollo</h3>
        {#if altaError}
          <div class="err-panel">⚠️ {altaError}</div>
        {/if}
        <label class="campo">
          <span>tipo <em>· obligatorio</em></span>
          <input class="input" bind:value={altaTipo} placeholder="PETG / PLA…" on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()} />
        </label>
        <label class="campo">
          <span>color</span>
          <input class="input" bind:value={altaColor} placeholder="por defecto desconocido" on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()} />
        </label>
        <label class="campo">
          <span>Longitud inicial (mm)</span>
          <input class="input" type="number" min="0" bind:value={altaLongitudStr} placeholder="vacío = longitud desconocida (no decrementable)" on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()} />
        </label>
        <label class="campo checkbox">
          <input type="checkbox" bind:checked={altaActivo} />
          <span>cargar como activo <em>(en la impresora)</em></span>
        </label>
        <div class="panel-gestos">
          <button class="btn-jefe" disabled={altaBusy} on:click={ejecutarAlta}>
            {altaBusy ? '⏳ registrando…' : '🆕 Registrar'}
          </button>
          <button class="btn-neutro" disabled={altaBusy} on:click={cerrarAlta}>cerrar</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .filamento-panel {
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
  .pulso-bajo {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
  }
  .badge-activo {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.72rem;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
  }
  .badge-inactivo {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.72rem;
    color: #a3a3a3;
    background: rgba(163, 163, 163, 0.12);
  }
  .btn-jefe, .btn-neutro {
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .btn-jefe { background: var(--color-primary, #eab308); color: #111; font-weight: 700; }
  .btn-jefe:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-neutro { background: transparent; color: inherit; border-color: var(--color-border, #444); }
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
  .vacio-txt { text-align: center; }
  .cinta { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .fila {
    display: block;
    padding: 0.5rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
  }
  .st-normal { border-left: 3px solid #3b82f6; }
  .st-bajo { border-left: 3px solid #f59e0b; }
  .st-activo { border-left: 3px solid #22c55e; }
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
  .chip-bajo {
    font-size: 0.66rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-weight: 700;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.14);
  }
  .chip-estado {
    font-size: 0.66rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .st-activo.chip-estado, .st-activo.fila { color: #22c55e; }
  .st-activo.chip-estado { background: rgba(34, 197, 94, 0.14); }
  .st-bajo.chip-estado { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
  .st-normal.chip-estado { color: #60a5fa; background: rgba(96, 165, 250, 0.14); }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; line-height: 1.5; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .panel {
    width: min(92vw, 460px);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--color-bg, #141414);
    border: 1px solid var(--color-border, #444);
    border-radius: 10px;
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .panel-titulo { margin: 0; font-size: 1rem; }
  .err-panel { font-size: 0.75rem; color: #ef4444; }
  .campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.74rem; color: var(--color-text-muted, #aaa); }
  .campo.em { display: none; }
  .campo em { font-style: normal; color: #f59e0b; }
  .campo.checkbox { flex-direction: row; align-items: center; gap: 0.4rem; }
  .input {
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #444);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .panel-gestos { display: flex; gap: 0.5rem; justify-content: flex-end; }
  /* ---- pestañas de rol (Trabajador | Jefe) ---- */
  .rol-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.15rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .rol-tab {
    flex: 1;
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-muted, #888);
    cursor: pointer;
    font-weight: 600;
  }
  .rol-tab:hover:not(.rol-tab-activa) { border-color: var(--color-border, #444); color: inherit; }
  .rol-tab-worker.rol-tab-activa { background: #60a5fa; color: #111; }
  .rol-tab-jefe.rol-tab-activa { background: var(--color-primary, #eab308); color: #111; }
</style>
