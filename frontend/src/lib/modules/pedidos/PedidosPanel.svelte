<script lang="ts">
  /**
   * PedidosPanel — LA ESTACIÓN DE TRANSICIONES del jefe (F7).
   *
   * El pedido vive en el COMANDERO (utilización: add/update/delete-item al elegir)
   * o nace en la PWA-tienda. Este panel del jefe SOLO transiciona estados del
   * pedido ya creado — jamás edita items (invariante del esquema-jefe).
   *
   * Composición 3 capas (esquema-jefe pasada-4):
   *   - CINTA-ESTADO (capa 1-2): "n abiertos · n en cocina · n completados hoy"
   *     vía pedido.list por estado (lecturas, R2).
   *   - TARJETAS ACTIVAS con gesto de transición según el estado ACTUAL (capa 3):
   *     abierto → [Enviar cocina] [Cancelar] · en cocina → [Completar] ·
   *     pendiente_recogida → [Confirmar recogida].
   *   - DECLARAR (capa 3, ROL JEFE): transiciones vía pedido.{create,send-kitchen,
   *     complete,cancel,confirmar-recogida} — contrato real con `id`. La SEÑAL
   *     pareada (pedido.creado/enviado_cocina/completado/cancelado/recogido)
   *     re-lee la cinta (R3) — nunca recarga.
   *   - Cancelación gruesa → confirmador-nombrado: nombra cuenta/canal + total.
   *
   * Patrón del repo: ProductosPanel / VariacionesPanel (mqttRequest + señales
   * dot-notation, sin estado asumido).
   */

  import { onMount } from 'svelte';
  import {
    pedidosActivosStore,
    completadosStore,
    cuentasStore,
    cintaStore,
    cintaLoading,
    cintaError,
    mutacionesPendientes,
    errorMutacion,
    loadCinta,
    resetPedidos,
    initPedidosSubscriptions,
    abrirPedido,
    enviarCocina,
    completarPedido,
    cancelarPedido,
    confirmarRecogida,
    formatearCentimos,
    dineroPedido,
    refCuenta,
    describeError,
    type Pedido,
    type RecogidaCandidato
  } from './stores/pedidos';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- ref-select de apertura (capa 1) ----
  let openCuenta = '';
  let abrirBusy = false;
  let abrirError: string | null = null;

  /** id de la tarjeta con mutación en vuelo (feedback por tarjeta, no global). */
  let busyId: string | null = null;
  /** errores nombrados EN su tarjeta (error de turno, no modal global). */
  let erroresPorTarjeta: Record<string, string> = {};

  // ---- confirmador-nombrado de cancelación ----
  let cancelAbierta: string | null = null;
  let cancelMotivo = '';
  let cancelBusyId: string | null = null;

  // ---- recogida por ancla (cliente_nombre) ----
  let recogidaNombre = '';
  let recogidaBusy = false;
  let recogidaAviso: string | null = null;
  /** candidatos de un 409 "varios pendientes a ese nombre" (elegir pedido_id). */
  let recogidaCandidatos: RecogidaCandidato[] = [];

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initPedidosSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetPedidos();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCinta(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetPedidos();
    }
  }

  // Reparto por fase (la cinta es el selector natural: la tarjeta ES el ref).
  $: abiertos = $pedidosActivosStore.filter((p) => p.estado === 'borrador' || p.estado === 'creado');
  $: enCocina = $pedidosActivosStore.filter((p) => p.estado === 'en_cocina');
  $: enRecogida = $pedidosActivosStore.filter((p) => p.estado === 'pendiente_recogida');
  $: completados = $completadosStore.slice(0, 8);

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

  // ---- DECLARAR: abrir pedido formal (ÚNICA creación del jefe) ----
  async function ejecutarApertura(): Promise<void> {
    if (!openCuenta) return;
    abrirBusy = true;
    abrirError = null;
    try {
      await abrirPedido(openCuenta);
      openCuenta = ''; // la señal pedido.creado re-lee la cinta (R3)
    } catch (err) {
      abrirError = describeError(err);
    } finally {
      abrirBusy = false;
    }
  }

  // ---- confirmador-nombrado de cancelación ----
  function abrirCancelacion(p: Pedido): void {
    cancelAbierta = p.id;
    cancelMotivo = '';
  }

  async function ejecutarCancelacion(p: Pedido): Promise<void> {
    if (!cancelAbierta) return;
    cancelBusyId = p.id;
    try {
      await cancelarPedido(p.id, cancelMotivo.trim() || undefined);
      cancelAbierta = null;
      cancelMotivo = '';
    } catch (err) {
      anotarError(p.id, describeError(err));
    } finally {
      cancelBusyId = null;
    }
  }

  // ---- recogida por ANCLA (cliente_nombre) ----
  async function buscarRecogida(): Promise<void> {
    if (!recogidaNombre.trim()) return;
    recogidaBusy = true;
    recogidaAviso = null;
    recogidaCandidatos = [];
    const res = await confirmarRecogida({ cliente_nombre: recogidaNombre.trim() });
    if (res.ok) {
      recogidaNombre = '';
    } else if (res.candidatos) {
      recogidaCandidatos = res.candidatos;
    } else {
      recogidaAviso = res.mensaje ?? 'no hay pedidos a ese nombre';
    }
    recogidaBusy = false;
  }

  async function confirmarCandidato(pedidoId: string): Promise<void> {
    recogidaBusy = true;
    const res = await confirmarRecogida({ pedido_id: pedidoId });
    if (res.ok) {
      recogidaCandidatos = [];
      recogidaAviso = null;
      recogidaNombre = '';
    } else {
      recogidaAviso = res.mensaje ?? 'no se pudo confirmar la recogida';
    }
    recogidaBusy = false;
  }

  /** HH:MM local de un ISO (para "desde" y "caduca"). */
  function hhmm(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="jefe-pedidos" data-pedidos-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">👔</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">transiciones del ciclo de vida · los items viven en el comandero</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $cintaError}
    <div class="cinta-error">⚠️ {$cintaError}</div>
  {/if}

  <!-- CAPA 1-2 · cinta-estado: el pulso sin navegar -->
  <div class="cinta-estado">
    <span class="pulso pulso-abiertos">📝 {$cintaStore.abiertos} abiertos</span>
    <span class="pulso pulso-cocina">🔥 {$cintaStore.cocina} en cocina</span>
    <span class="pulso pulso-recogida">📦 {$cintaStore.recogida} en recogida</span>
    <span class="pulso pulso-completados">✅ {$cintaStore.completadosHoy} completados hoy</span>
  </div>

  <!-- CAPA 3 · DECLARAR: abrir pedido formal sobre cuenta activa (ref-select) -->
  {#if $cuentasStore.length > 0}
    <div class="fila-abrir">
      <select class="ref-select" bind:value={openCuenta} aria-label="Cuenta activa">
        <option value="" disabled>abrir pedido sobre cuenta…</option>
        {#each $cuentasStore as c (c.id)}
          <option value={c.id}>{c.ref_display || c.nombre || c.id.slice(0, 8)}{c.tipo ? ` · ${c.tipo}` : ''}</option>
        {/each}
      </select>
      <button class="btn-jefe" disabled={abrirBusy || !openCuenta} on:click={ejecutarApertura}>
        🆕 Abrir pedido
      </button>
      {#if abrirError}
        <span class="error-fila">{abrirError}</span>
      {/if}
    </div>
  {:else}
    <div class="vacio">sin cuentas abiertas en esta caja — las cuentas se abren en el comandero</div>
  {/if}

  <!-- CAPA 2-3 · columnas de la estación con gestos de transición -->
  {#if $cintaLoading && $pedidosActivosStore.length === 0}
    <div class="gm-loading">cargando pedidos…</div>
  {:else if $pedidosActivosStore.length === 0}
    <div class="vacio">sin pedidos activos — nacen en el comandero al elegir, o en la PWA-tienda</div>
  {:else}
    <div class="columnas">
      <!-- fase ABIERTA -->
      <section class="columna">
        <h4>📝 Abiertos</h4>
        {#each abiertos as p (p.id)}
          <article class="tarjeta">
            <header>
              <span class="ref">{refCuenta(p)}</span>
              <span class="money">{dineroPedido(p)}</span>
            </header>
            <div class="meta">{p.items?.length ?? 0} items{p.notas_generales ? ' · 📝' : ''}</div>
            {#if erroresPorTarjeta[p.id]}
              <div class="err-tarjeta">{erroresPorTarjeta[p.id]}</div>
            {/if}
            <div class="gestos">
              <button
                class="btn-jefe"
                disabled={busyId === p.id}
                title="abierto → en cocina (pedido.enviado_cocina)"
                on:click={() => transicion(p.id, () => enviarCocina(p.id))}
              >🔥 Enviar cocina</button>
              <button
                class="btn-grueso"
                disabled={busyId === p.id}
                title="cancelar pedido (destructiva: pide confirmación nombrada)"
                on:click={() => abrirCancelacion(p)}
              >✖</button>
            </div>
            {#if cancelAbierta === p.id}
              <div class="confirmador">
                <p>¿cancelar <strong>{refCuenta(p)}</strong> por {dineroPedido(p)}? No se deshace.</p>
                <input
                  class="motivo"
                  placeholder="motivo (opcional)"
                  bind:value={cancelMotivo}
                  on:keydown={(e) => e.key === 'Enter' && ejecutarCancelacion(p)}
                />
                <div class="confirm-gestos">
                  <button class="btn-rojo" disabled={cancelBusyId === p.id} on:click={() => ejecutarCancelacion(p)}>cancelar pedido</button>
                  <button class="btn-neutro" on:click={() => (cancelAbierta = null)}>dejarlo estar</button>
                </div>
              </div>
            {/if}
          </article>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
      </section>

      <!-- fase COCINA -->
      <section class="columna">
        <h4>🔥 En cocina</h4>
        {#each enCocina as p (p.id)}
          <article class="tarjeta">
            <header>
              <span class="ref">{refCuenta(p)}</span>
              <span class="money">{dineroPedido(p)}</span>
            </header>
            <div class="meta">{p.items?.length ?? 0} items{p.enviado_cocina_at ? ` · desde ${hhmm(p.enviado_cocina_at)}` : ''}</div>
            {#if erroresPorTarjeta[p.id]}
              <div class="err-tarjeta">{erroresPorTarjeta[p.id]}</div>
            {/if}
            <div class="gestos">
              <button
                class="btn-jefe"
                disabled={busyId === p.id}
                title="en cocina → completado (pedido.completado)"
                on:click={() => transicion(p.id, () => completarPedido(p.id))}
              >✅ Completar</button>
            </div>
          </article>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
      </section>

      <!-- fase RECOGIDA -->
      <section class="columna">
        <h4>📦 Recogida</h4>
        {#each enRecogida as p (p.id)}
          <article class="tarjeta">
            <header>
              <span class="ref">🏷️ {p.cliente_nombre || p.id.slice(0, 8)}</span>
              <span class="money">{dineroPedido(p)}</span>
            </header>
            <div class="meta">{p.items?.length ?? 0} items · {p.canal_origen || 'tienda'}{p.expira_at ? ` · caduca ${hhmm(p.expira_at)}` : ''}</div>
            {#if erroresPorTarjeta[p.id]}
              <div class="err-tarjeta">{erroresPorTarjeta[p.id]}</div>
            {/if}
            <div class="gestos">
              <button
                class="btn-jefe"
                disabled={busyId === p.id}
                title="pendiente_recogida → recogido_y_cobrado (pedido.recogido)"
                on:click={() => transicion(p.id, async () => {
                  const res = await confirmarRecogida({ pedido_id: p.id });
                  if (!res.ok && !res.candidatos) anotarError(p.id, res.mensaje ?? 'no se pudo confirmar');
                })}
              >✔️ Confirmar recogida</button>
            </div>
          </article>
        {:else}
          <div class="vacio-col">—</div>
        {/each}
        <div class="recogida-manual">
          <input
            class="motivo"
            placeholder="ancla: nombre del cliente…"
            bind:value={recogidaNombre}
            on:keydown={(e) => e.key === 'Enter' && buscarRecogida()}
          />
          <button class="btn-neutro" disabled={recogidaBusy || !recogidaNombre.trim()} on:click={buscarRecogida}>buscar</button>
        </div>
        {#if recogidaCandidatos.length > 0}
          <div class="confirmador">
            <p>varios pendientes a ese nombre — elige:</p>
            {#each recogidaCandidatos as c (c.pedido_id)}
              <button
                class="btn-jefe btn-ancho"
                disabled={recogidaBusy}
                on:click={() => confirmarCandidato(c.pedido_id)}
              >{c.pedido_id.slice(0, 8)} · {formatearCentimos(c.total_centimos)}</button>
            {/each}
          </div>
        {/if}
        {#if recogidaAviso}
          <div class="err-tarjeta">{recogidaAviso}</div>
        {/if}
      </section>

      <!-- fase COMPLETADOS (lectura, muere con caja.cerrada) -->
      <section class="columna columna-verde">
        <h4>✅ Completados hoy</h4>
        {#each completados as p (p.id)}
          <div class="fila-completado">
            <span class="ref">{refCuenta(p)}</span>
            <span class="money">{dineroPedido(p)}</span>
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
  .jefe-pedidos {
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
  .pulso-abiertos {
    color: #9ca3af;
    background: rgba(156, 163, 175, 0.12);
  }
  .pulso-cocina {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.12);
  }
  .pulso-recogida {
    color: #a78bfa;
    background: rgba(167, 139, 250, 0.12);
  }
  .pulso-completados {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
  }
  .fila-abrir {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .ref-select {
    flex: 1;
    min-width: 200px;
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .error-fila {
    font-size: 0.7rem;
    color: #ef4444;
  }
  .columnas {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted, #888);
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .columna-verde h4 {
    color: #22c55e;
  }
  .tarjeta {
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .tarjeta header {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: baseline;
  }
  .ref {
    font-weight: 700;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .money {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    color: var(--color-primary, #eab308);
  }
  .meta {
    font-size: 0.68rem;
    color: var(--color-text-muted, #888);
  }
  .gestos {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .btn-jefe {
    flex: 1;
    cursor: pointer;
    background: var(--color-primary, #eab308);
    color: #111;
    border: none;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .btn-jefe:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .btn-grueso {
    cursor: pointer;
    flex: 0 0 auto;
    background: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    font-size: 0.72rem;
  }
  .btn-neutro {
    cursor: pointer;
    background: transparent;
    color: var(--color-text-muted, #888);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    font-size: 0.7rem;
  }
  .btn-rojo {
    cursor: pointer;
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.38rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .btn-rojo:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .btn-ancho {
    width: 100%;
  }
  .confirmador {
    border-top: 1px dashed #ef4444;
    padding-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .confirmador p {
    margin: 0;
    font-size: 0.72rem;
  }
  .motivo {
    width: 100%;
    background: var(--color-surface, #111);
    color: inherit;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-size: 0.72rem;
  }
  .confirm-gestos {
    display: flex;
    gap: 0.4rem;
  }
  .err-tarjeta {
    font-size: 0.68rem;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
  }
  .err-pie {
    font-size: 0.7rem;
    color: #ef4444;
    padding: 0.3rem 0.5rem;
    border-top: 1px solid rgba(239, 68, 68, 0.35);
  }
  .cinta-error {
    font-size: 0.72rem;
    color: #ef4444;
    padding: 0.2rem 0.5rem;
  }
  .recogida-manual {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }
  .recogida-manual .motivo {
    flex: 1;
  }
  .vacio {
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
    padding: 0.8rem 0.5rem;
    text-align: center;
  }
  .vacio-col {
    color: var(--color-border, #555);
    text-align: center;
    font-size: 0.75rem;
    padding: 0.5rem 0;
  }
  .gm-loading {
    font-size: 0.8rem;
    color: var(--color-text-muted, #888);
    padding: 0.8rem 0.5rem;
  }
  .fila-completado {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
    padding: 0.25rem 0.1rem;
    border-bottom: 1px dotted var(--color-border, #2a2a2a);
  }
</style>