<script lang="ts">
  /**
   * ServicioToggle — el interruptor de apertura/cierre de pedidos de tienda.
   *
   * Vive en el header del comandero. Es la cara visible de `pedido.servicio.set`:
   * el dueño cierra en un toque cuando hay saturación (con reapertura automática si
   * pone hora) y abre cuando amaine. NO afecta a las mesas: los pedidos de mesa no
   * pasan por la puerta `pedido.crear-tienda`, así que el bar sigue trabajando.
   *
   * La fuente de verdad NO es este componente: es `<storage>/pizzepos/servicio/config.json`.
   * Aquí solo se lee (`servicio.estado`) y se escribe (`servicio.set`). Si la tool no
   * existe (backend sin desplegar), el pill NO se pinta: el comandero sigue igual.
   */
  import { onMount, onDestroy } from 'svelte';
  import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
  import { subscribe as mqttSubscribe } from '$lib/ui-core';

  export let projectId: string = '';
  export let projectSlug: string = '';

  type EstadoServicio = {
    abierto: boolean;
    motivo?: string | null;
    motivo_texto?: string | null;
    hasta?: string | null;
    aviso?: string | null;
    mensaje?: string | null;
    horario_hoy?: string | null;
    franja_actual?: string | null;
    proxima_apertura?: { iso?: string | null } | null;
    recogida?: { direccion?: string | null; ciudad?: string | null; maps_url?: string | null } | null;
    pedidos_pendientes?: number;
  };

  let estado: EstadoServicio | null = null;
  let cargando = true;
  let disponible = false; // sin respuesta de la tool, el pill NO existe
  let panelAbierto = false;
  let guardando = false;
  let error = '';
  let aviso = '';
  let horaCierre = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let unsubCambio: (() => void) | null = null;

  $: clave = projectSlug || projectId;
  $: abierto = estado?.abierto === true;
  $: tituloHorario = estado?.franja_actual
    ? `Ahora: ${estado.franja_actual}`
    : (estado?.horario_hoy ? `Hoy: ${estado.horario_hoy}` : 'Hoy sin horario');

  async function cargar(recargar = false) {
    if (!clave) return;
    try {
      const res = await mqttRequest<EstadoServicio>('pedido', 'servicio.estado', {
        project_slug: clave,
        recargar
      });
      estado = res?.data || null;
      disponible = true;
      error = '';
    } catch (err: any) {
      if (err instanceof MqttRequestError && err.status === 404) {
        // Backend sin la tool: el comandero se comporta como antes.
        disponible = false;
        return;
      }
      error = err?.message || 'no se pudo leer el estado del servicio';
    } finally {
      cargando = false;
    }
  }

  async function fijar(payload: Record<string, unknown>) {
    if (!clave || guardando) return;
    guardando = true;
    error = '';
    try {
      const res = await mqttRequest<EstadoServicio>('pedido', 'servicio.set', {
        project_slug: clave,
        ...payload
      });
      if (res?.data) estado = res.data;
      disponible = true;
      aviso = '';
      horaCierre = '';
      await cargar(true);
    } catch (err: any) {
      error = err?.message || 'no se pudo cambiar el servicio';
    } finally {
      guardando = false;
    }
  }

  /** Cierre con reloj: se reabre solo cuando vence. */
  function cerrarPor(minutos: number) {
    const hasta = new Date(Date.now() + minutos * 60000).toISOString();
    fijar({ abierto: false, motivo: 'saturacion', hasta, aviso: aviso.trim() || null });
  }

  /** Cierre hasta una hora concreta (hoy, o mañana si esa hora ya pasó). */
  function cerrarHastaHora() {
    if (!/^\d{2}:\d{2}$/.test(horaCierre)) {
      error = 'Elige una hora de reapertura';
      return;
    }
    const [h, m] = horaCierre.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    fijar({ abierto: false, motivo: 'manual', hasta: d.toISOString(), aviso: aviso.trim() || null });
  }

  /** Cierre con candado: no se reabre hasta que el dueño lo abra. */
  function cerrarSinHora() {
    fijar({ abierto: false, motivo: 'manual', hasta: null, aviso: aviso.trim() || null });
  }

  function abrirAhora() {
    fijar({ abierto: true, hasta: null, motivo: 'manual' });
  }

  function fmtHora(iso?: string | null): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-ES', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  onMount(() => {
    cargar(true);
    // Otro dispositivo (u otra pestaña) cambió el servicio → refrescar sin esperar al poll.
    unsubCambio = mqttSubscribe('servicio.cambiado', (payload: any) => {
      const d = payload?.data || payload?.payload || payload;
      const delProyecto = d?.project_slug || d?.project_id;
      if (!delProyecto || delProyecto === clave) cargar(true);
    });
    // El cierre con `hasta` vence solo en el backend; el poll hace que la pantalla se entere.
    pollTimer = setInterval(() => {
      if (!panelAbierto) cargar(false);
    }, 30000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    unsubCambio?.();
  });
</script>

{#if disponible && estado}
  <button
    class="pill"
    class:on={abierto}
    class:off={!abierto}
    on:click={() => (panelAbierto = true)}
    title="Pedidos de tienda: abrir o cerrar"
  >
    <span class="dot"></span>
    <span class="pill-label">{abierto ? 'ABIERTO' : 'CERRADO'}</span>
  </button>
{/if}

{#if panelAbierto}
  <div class="overlay" role="presentation" on:click={() => (panelAbierto = false)}>
    <div class="panel" role="dialog" aria-modal="true" aria-label="Servicio de pedidos de tienda" on:click|stopPropagation>
      <header class="panel-header">
        <div>
          <h2>Pedidos de tienda</h2>
          <p class="sub">{abierto ? 'Aceptando pedidos' : 'No se aceptan pedidos ahora'}</p>
        </div>
        <button class="x" on:click={() => (panelAbierto = false)} aria-label="Cerrar">&times;</button>
      </header>

      <div class="estado" class:on={abierto} class:off={!abierto}>
        <span class="dot"></span>
        <strong>{abierto ? 'ABIERTO' : 'CERRADO'}</strong>
        {#if !abierto && estado?.motivo_texto}
          <span class="motivo">· {estado.motivo_texto}</span>
        {/if}
      </div>

      <p class="linea">{tituloHorario}</p>
      {#if !abierto}
        {#if estado?.hasta}
          <p class="linea">Se reabre solo: <strong>{fmtHora(estado.hasta)}</strong></p>
        {:else}
          <p class="linea">Cerrado hasta que lo abras tú</p>
        {/if}
        {#if estado?.aviso}
          <p class="aviso-cliente">«{estado.aviso}»</p>
        {/if}
      {/if}
      {#if typeof estado?.pedidos_pendientes === 'number' && estado.pedidos_pendientes > 0}
        <p class="linea pendientes">{estado.pedidos_pendientes} pedido{estado.pedidos_pendientes === 1 ? '' : 's'} de tienda pendiente{estado.pedidos_pendientes === 1 ? '' : 's'} de recogida</p>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      {#if abierto}
        <label class="campo">
          <span>Aviso para el cliente (opcional)</span>
          <input
            type="text"
            bind:value={aviso}
            placeholder="Estamos a tope, volvemos en un rato"
            maxlength="120"
            disabled={guardando}
          />
        </label>

        <p class="seccion">Cerrar un rato</p>
        <div class="chips">
          <button class="chip" disabled={guardando} on:click={() => cerrarPor(30)}>30 min</button>
          <button class="chip" disabled={guardando} on:click={() => cerrarPor(60)}>1 hora</button>
          <button class="chip" disabled={guardando} on:click={() => cerrarPor(120)}>2 horas</button>
        </div>

        <p class="seccion">Cerrar hasta una hora</p>
        <div class="fila">
          <input type="time" bind:value={horaCierre} disabled={guardando} />
          <button class="btn" disabled={guardando} on:click={cerrarHastaHora}>Cerrar</button>
        </div>

        <button class="btn peligro" disabled={guardando} on:click={cerrarSinHora}>
          Cerrar ya, sin hora
        </button>
        <p class="nota">Las mesas no se ven afectadas: esto solo frena los pedidos de recogida.</p>
      {:else}
        <button class="btn abrir" disabled={guardando} on:click={abrirAhora}>
          {guardando ? 'Abriendo…' : 'Abrir ahora'}
        </button>
      {/if}

      {#if estado?.recogida?.direccion}
        <p class="recogida">
          Recogida: {estado.recogida.direccion}{estado.recogida.ciudad ? `, ${estado.recogida.ciudad}` : ''}
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ── Pill del header ─────────────────────────────────────────── */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: 13px;
    border: 1px solid #2a2a2a;
    background: #161616;
    color: #888;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pill:hover { background: #1e1e1e; }

  .pill .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #555;
    flex-shrink: 0;
  }

  .pill.on {
    border-color: #1f7a3d;
    background: #0f2a19;
    color: #6ee7a0;
  }
  .pill.on .dot {
    background: #34d399;
    box-shadow: 0 0 6px rgba(52, 211, 153, 0.7);
  }

  .pill.off {
    border-color: #7a2c1f;
    background: #2a120f;
    color: #fca5a5;
  }
  .pill.off .dot { background: #ef4444; }

  /* ── Overlay + panel ────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 900;
    padding: 16px;
  }

  .panel {
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow-y: auto;
    background: #131313;
    border: 1px solid #262626;
    border-radius: 14px;
    padding: 16px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: #fff;
  }

  .sub {
    margin: 2px 0 0;
    font-size: 0.75rem;
    color: #777;
  }

  .x {
    background: none;
    border: none;
    color: #777;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .x:hover { color: #fff; }

  .estado {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 0.85rem;
    margin-bottom: 10px;
  }
  .estado .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .estado.on { background: #0f2a19; color: #6ee7a0; border: 1px solid #1f7a3d; }
  .estado.on .dot { background: #34d399; }
  .estado.off { background: #2a120f; color: #fca5a5; border: 1px solid #7a2c1f; }
  .estado.off .dot { background: #ef4444; }
  .motivo { color: #d9a0a0; font-weight: 500; }

  .linea {
    margin: 0 0 4px;
    font-size: 0.78rem;
    color: #999;
  }
  .linea.pendientes { color: #fbbf24; }

  .aviso-cliente {
    margin: 6px 0 0;
    padding: 8px 10px;
    background: #191919;
    border-left: 3px solid #7a2c1f;
    border-radius: 6px;
    font-size: 0.78rem;
    color: #ddd;
    font-style: italic;
  }

  .error {
    margin: 10px 0 0;
    padding: 8px 10px;
    background: #2a120f;
    border: 1px solid #7a2c1f;
    border-radius: 8px;
    font-size: 0.75rem;
    color: #fca5a5;
  }

  .campo {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 14px 0 4px;
  }
  .campo span {
    font-size: 0.72rem;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }
  .campo input {
    background: #0b0b0b;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 9px 10px;
    color: #eee;
    font-size: 0.82rem;
    outline: none;
  }
  .campo input:focus { border-color: #3a3a3a; }

  .seccion {
    margin: 16px 0 6px;
    font-size: 0.72rem;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }

  .chips {
    display: flex;
    gap: 8px;
  }

  .chip {
    flex: 1;
    padding: 10px 6px;
    border-radius: 9px;
    border: 1px solid #3a3a3a;
    background: #1b1b1b;
    color: #e5e5e5;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .chip:hover:not(:disabled) { background: #262626; border-color: #4a4a4a; }

  .fila {
    display: flex;
    gap: 8px;
  }
  .fila input[type='time'] {
    flex: 1;
    background: #0b0b0b;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 9px 10px;
    color: #eee;
    font-size: 0.88rem;
    outline: none;
  }

  .btn {
    padding: 10px 14px;
    border-radius: 9px;
    border: 1px solid #3a3a3a;
    background: #1f1f1f;
    color: #e5e5e5;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: #2a2a2a; }
  .btn:disabled, .chip:disabled { opacity: 0.5; cursor: wait; }

  .btn.peligro {
    width: 100%;
    margin-top: 10px;
    border-color: #7a2c1f;
    background: #21100e;
    color: #fca5a5;
  }
  .btn.peligro:hover:not(:disabled) { background: #2f1613; }

  .btn.abrir {
    width: 100%;
    margin-top: 14px;
    padding: 14px;
    border-color: #1f7a3d;
    background: #0f2a19;
    color: #6ee7a0;
    font-size: 0.95rem;
  }
  .btn.abrir:hover:not(:disabled) { background: #143d24; }

  .nota {
    margin: 10px 0 0;
    font-size: 0.7rem;
    color: #666;
  }

  .recogida {
    margin: 14px 0 0;
    padding-top: 10px;
    border-top: 1px solid #222;
    font-size: 0.72rem;
    color: #777;
  }

  @media (max-width: 600px) {
    .pill { height: 22px; padding: 0 8px; font-size: 0.62rem; gap: 5px; }
    .pill .dot { width: 7px; height: 7px; }
    .panel { padding: 12px; }
  }
</style>
