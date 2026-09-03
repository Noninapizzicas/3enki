<script lang="ts">
  /**
   * CobrosPanel — LA ESTACIÓN DE TRANSICIONES del dinero del día (F7).
   *
   * El cobro NACE en el POS (utilización: el comandero/cuenta llama cobro.create
   * al cobrar al cliente). Este panel del jefe GESTIONA los cobros del día:
   * ver qué hay pendiente, CONFIRMAR lo cobrado, REEMBOLSAR lo que haya que
   * devolver. Jamás re-precía ni toca el gateway externo (invariante).
   *
   * Composición 3 capas (esquema-jefe de cobros):
   *   - CINTA-ESTADO (capa 1-2): "n cobros hoy · n confirmados · n reembolsados"
   *     vía cobro.list (lecturas, R2).
   *   - TARJETAS de cobros con gesto de transición según el estado ACTUAL (capa 3):
   *     pendiente/procesando → [Confirmar] · completado → [Reembolsar].
   *   - DECLARAR (capa 3, ROL JEFE): transiciones vía cobro.{confirm,refund} —
   *     contrato real con `id`. La SEÑAL pareada (cobro.procesado/reembolsado)
   *     re-lee la cinta (R3) — nunca recarga.
   *   - Confirmar y reembolsar son transiciones de dinero → confirmador-nombrado
   *     (nombra cuenta + monto_total + método; refund con motivo).
   *
   * Patrón del repo: PedidosPanel / EntregaPanel (mqttRequest + señales
   * dot-notation, sin estado asumido). TODOS los RPC con project_id inyectado
   * (lección bug escandallo).
   */

  import { onMount } from 'svelte';
  import {
    cobrosStore,
    metodosPagoStore,
    cintaStore,
    cintaLoading,
    cintaError,
    mutacionesPendientes,
    errorMutacion,
    loadCinta,
    resetCobros,
    initCobrosSubscriptions,
    confirmarCobro,
    reembolsarCobro,
    formatearEuros,
    refCuenta,
    NOMBRE_METODO,
    describeError,
    type Cobro
  } from './stores/cobros';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /** id de la tarjeta con mutación en vuelo (feedback por tarjeta, no global). */
  let busyId: string | null = null;
  /** errores nombrados EN su tarjeta (error de turno, no modal global). */
  let erroresPorTarjeta: Record<string, string> = {};

  // ---- confirmador-nombrado de confirmación ----
  let confirmAbierta: string | null = null;
  let confirmReferencia = '';
  let confirmBusyId: string | null = null;

  // ---- confirmador-nombrado de reembolso ----
  let refundAbierta: string | null = null;
  let refundMotivo = '';
  let refundBusyId: string | null = null;

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCobrosSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCobros();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCinta(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetCobros();
    }
  }

  // Reparto por fase (la cinta es el selector natural: la tarjeta ES el ref).
  $: pendientes = $cobrosStore.filter((c) => c.estado === 'pendiente' || c.estado === 'procesando');
  $: confirmados = $cobrosStore.filter((c) => c.estado === 'completado');
  $: reembolsados = $cobrosStore.filter((c) => c.estado === 'reembolsado');

  function anotarError(id: string, message: string): void {
    erroresPorTarjeta = { ...erroresPorTarjeta, [id]: message };
  }

  /** Gesto genérico de transición: error nombrado EN su tarjeta. */
  async function transicion(id: string, fn: () => Promise<void>): Promise<void> {
    busyId = id;
    try {
      await fn();
    } catch (err) {
      anotarError(id, describeError(err));
    } finally {
      busyId = null;
    }
  }

  // ---- confirmador-nombrado de confirmación ----
  function abrirConfirmacion(c: Cobro): void {
    confirmAbierta = c.id;
    confirmReferencia = '';
  }

  async function ejecutarConfirmacion(c: Cobro): Promise<void> {
    if (!confirmAbierta) return;
    confirmBusyId = c.id;
    try {
      await confirmarCobro(c.id, confirmReferencia.trim() || undefined);
      confirmAbierta = null;
      confirmReferencia = '';
    } catch (err) {
      anotarError(c.id, describeError(err));
    } finally {
      confirmBusyId = null;
    }
  }

  // ---- confirmador-nombrado de reembolso ----
  function abrirReembolso(c: Cobro): void {
    refundAbierta = c.id;
    refundMotivo = '';
  }

  async function ejecutarReembolso(c: Cobro): Promise<void> {
    if (!refundAbierta) return;
    refundBusyId = c.id;
    try {
      await reembolsarCobro(c.id, refundMotivo.trim() || undefined);
      refundAbierta = null;
      refundMotivo = '';
    } catch (err) {
      anotarError(c.id, describeError(err));
    } finally {
      refundBusyId = null;
    }
  }

  /** HH:MM local de un ISO (para "desde" y "caduca"). */
  function hhmm(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function nombreMetodo(c: Cobro): string {
    return NOMBRE_METODO[c.metodo_pago] ?? c.metodo_pago;
  }
</script>

<div class="jefe-cobros" data-cobros-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">👔</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">gestiona los cobros del día · el POS cobra al cliente</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $cintaError}
    <div class="cinta-error">⚠️ {$cintaError}</div>
  {/if}

  <!-- CAPA 1-2 · cinta-estado: el pulso sin navegar -->
  <div class="cinta-estado">
    <span class="pulso pulso-total">💳 {$cintaStore.total} cobros hoy</span>
    <span class="pulso pulso-pendientes">⏳ {$cintaStore.pendientes} a confirmar</span>
    <span class="pulso pulso-confirmados">✅ {$cintaStore.confirmados} confirmados</span>
    <span class="pulso pulso-reembolsados">↩️ {$cintaStore.reembolsados} reembolsados</span>
  </div>

  <!-- CAPA 2-3 · columnas de la estación con gestos de transición -->
  {#if $cintaLoading && $cobrosStore.length === 0}
    <div class="gm-loading">cargando cobros…</div>
  {:else if $cobrosStore.length === 0}
    <div class="vacio">sin cobros hoy — nacen en el POS al cobrar al cliente</div>
  {:else}
    <div class="columnas">
      <!-- fase PENDIENTE (a confirmar) -->
      <section class="columna">
        <h4>⏳ A confirmar</h4>
        {#each pendientes as c (c.id)}
          <article class="tarjeta">
            <header>
              <span class="ref">{refCuenta(c)}</span>
              <span class="money">{formatearEuros(c.monto_total)}</span>
            </header>
            <div class="meta">{nombreMetodo(c)}{c.propina ? ` · propina ${formatearEuros(c.propina)}` : ''}{c.cambio !== undefined ? ` · cambio ${formatearEuros(c.cambio)}` : ''}</div>
            {#if erroresPorTarjeta[c.id]}
              <div class="err-tarjeta">{erroresPorTarjeta[c.id]}</div>
            {/if}
            <div class="gestos">
              <button
                class="btn-jefe"
                disabled={busyId === c.id}
                title="pendiente/procesando → completado (cobro.procesado)"
                on:click={() => abrirConfirmacion(c)}
              >✅ Confirmar</button>
            </div>
            {#if confirmAbierta === c.id}
              <div class="confirmador">
                <p>¿confirma el cobro de <strong>{formatearEuros(c.monto_total)}</strong> de <strong>{refCuenta(c)}</strong> ({nombreMetodo(c)})?</p>
                <input
                  class="motivo"
                  placeholder="referencia de pago (opcional)"
                  bind:value={confirmReferencia}
                  on:keydown={(e) => e.key === 'Enter' && ejecutarConfirmacion(c)}
                />
                <div class="confirm-gestos">
                  <button class="btn-verde" disabled={confirmBusyId === c.id} on:click={() => ejecutarConfirmacion(c)}>confirmar cobro</button>
                  <button class="btn-neutro" on:click={() => (confirmAbierta = null)}>dejarlo estar</button>
                </div>
              </div>
            {/if}
          </article>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
      </section>

      <!-- fase CONFIRMADOS -->
      <section class="columna columna-verde">
        <h4>✅ Confirmados</h4>
        {#each confirmados as c (c.id)}
          <article class="tarjeta">
            <header>
              <span class="ref">{refCuenta(c)}</span>
              <span class="money">{formatearEuros(c.monto_total)}</span>
            </header>
            <div class="meta">{nombreMetodo(c)}{c.completado_at ? ` · ${hhmm(c.completado_at)}` : ''}{c.referencia_pago ? ` · ${c.referencia_pago}` : ''}</div>
            {#if erroresPorTarjeta[c.id]}
              <div class="err-tarjeta">{erroresPorTarjeta[c.id]}</div>
            {/if}
            <div class="gestos">
              <button
                class="btn-grueso"
                disabled={busyId === c.id}
                title="completado → reembolsado (cobro.reembolsado, devuelve dinero)"
                on:click={() => abrirReembolso(c)}
              >↩️ Reembolsar</button>
            </div>
            {#if refundAbierta === c.id}
              <div class="confirmador">
                <p>¿reembolsa <strong>{formatearEuros(c.monto_total)}</strong> a <strong>{refCuenta(c)}</strong>? No se deshace.</p>
                <input
                  class="motivo"
                  placeholder="motivo (opcional)"
                  bind:value={refundMotivo}
                  on:keydown={(e) => e.key === 'Enter' && ejecutarReembolso(c)}
                />
                <div class="confirm-gestos">
                  <button class="btn-rojo" disabled={refundBusyId === c.id} on:click={() => ejecutarReembolso(c)}>reembolsar cobro</button>
                  <button class="btn-neutro" on:click={() => (refundAbierta = null)}>dejarlo estar</button>
                </div>
              </div>
            {/if}
          </article>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
      </section>

      <!-- fase REEMBOLSADOS (lectura) -->
      <section class="columna">
        <h4>↩️ Reembolsados</h4>
        {#each reembolsados as c (c.id)}
          <div class="fila-reembolsado">
            <span class="ref">{refCuenta(c)}</span>
            <span class="money">{formatearEuros(c.monto_total)}</span>
            {#if c.motivo_reembolso}
              <span class="motivo-txt">{c.motivo_reembolso}</span>
            {/if}
          </div>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
      </section>
    </div>
  {/if}

  {#if $errorMutacion}
    <div class="err-pie">{$errorMutacion}</div>
  {/if}
</div>

<style>
  .jefe-cobros {
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
  .badge-icon {
    font-size: 0.85rem;
  }
  .badge-label {
    font-weight: 700;
    color: var(--color-primary, #eab308);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-scope {
    color: var(--color-text-muted, #888);
    font-size: 0.65rem;
  }
  .badge-sync {
    margin-left: auto;
    color: var(--color-primary, #eab308);
    font-size: 0.65rem;
  }
  .cinta-estado {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    font-size: 0.75rem;
  }
  .pulso {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .pulso-total {
    color: #eab308;
    background: rgba(234, 179, 8, 0.12);
  }
  .pulso-pendientes {
    color: #eab308;
    background: rgba(234, 179, 8, 0.12);
  }
  .pulso-confirmados {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
  }
  .pulso-reembolsados {
    color: #9ca3af;
    background: rgba(156, 163, 175, 0.12);
  }
  .columnas {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }
  @media (max-width: 1100px) {
    .columnas {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .columna {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 120px;
  }
  .columna h4 {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .columna-verde h4 {
    color: #22c55e;
  }
  .tarjeta {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.5rem 0.6rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .tarjeta header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.4rem;
  }
  .ref {
    font-weight: 600;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .money {
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--color-primary, #eab308);
    white-space: nowrap;
  }
  .meta {
    font-size: 0.68rem;
    color: var(--color-text-muted, #888);
  }
  .motivo-txt {
    font-size: 0.65rem;
    color: var(--color-text-muted, #888);
    font-style: italic;
  }
  .gestos {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }
  .btn-jefe {
    flex: 1;
    background: var(--color-primary, #eab308);
    color: #111;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-jefe:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-grueso {
    flex: 1;
    background: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-grueso:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .confirmador {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    font-size: 0.72rem;
  }
  .confirmador p {
    margin: 0;
  }
  .motivo {
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    font-size: 0.72rem;
  }
  .confirm-gestos {
    display: flex;
    gap: 0.4rem;
  }
  .btn-verde {
    flex: 1;
    background: #22c55e;
    color: #111;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-rojo {
    flex: 1;
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn-neutro {
    flex: 1;
    background: transparent;
    color: var(--color-text-muted, #888);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .err-tarjeta {
    font-size: 0.68rem;
    color: #ef4444;
  }
  .err-pie {
    font-size: 0.7rem;
    color: #ef4444;
  }
  .cinta-error {
    font-size: 0.7rem;
    color: #ef4444;
  }
  .vacio {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    padding: 0.5rem;
  }
  .vacio-col {
    font-size: 0.7rem;
    color: var(--color-text-muted, #555);
  }
  .gm-loading {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }
  .fila-reembolsado {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.4rem 0.6rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
</style>
