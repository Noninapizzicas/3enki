<script lang="ts">
  /**
   * CobroPanel — Flotante para procesar cobro de cuenta
   *
   * - 7 métodos de pago: efectivo, tarjeta, bizum, transferencia, mixto, link_pago, qr
   * - Propina opcional
   * - Efectivo: input monto recibido + cálculo cambio
   * - Link/QR: muestra URL generada
   *
   * Usa módulo: cobro
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { imprimirTicketVenta } from '$lib/stores/impresion';
  import CierreCajaPanel from './CierreCajaPanel.svelte';

  export let cuenta_id: string;
  export let monto: number;
  export let pedido_ids: string[] = [];
  export let items: any[] = [];
  export let visible: boolean = true;
  export let project_id: string = '';

  // Cierre de caja
  let showCierreCaja = false;

  const dispatch = createEventDispatcher<{
    close: void;
    success: { cobro_id: string; estado: string };
    error: { message: string };
  }>();

  // Estado
  let loading = false;
  let error: string | null = null;

  // Métodos de pago con emojis
  const metodosPago = [
    { id: 'efectivo', nombre: 'Efectivo', emoji: '💵' },
    { id: 'tarjeta', nombre: 'Tarjeta', emoji: '💳' },
    { id: 'bizum', nombre: 'Bizum', emoji: '📱' },
    { id: 'transferencia', nombre: 'Transferencia', emoji: '🏦' },
    { id: 'mixto', nombre: 'Mixto', emoji: '🔀', disabled: true }, // v2
    { id: 'link_pago', nombre: 'Link', emoji: '🔗' },
    { id: 'qr', nombre: 'QR', emoji: '📲' }
  ];

  // Selección
  let metodoSeleccionado: string | null = null;
  let propina: number = 0;
  let montoRecibido: number = 0;

  // Resultado cobro
  let cobroCreado: any = null;

  // Cálculos
  $: montoTotal = monto + propina;
  $: cambio = metodoSeleccionado === 'efectivo' ? Math.max(0, montoRecibido - montoTotal) : 0;
  $: montoInsuficiente = metodoSeleccionado === 'efectivo' && montoRecibido > 0 && montoRecibido < montoTotal;

  // Propinas rápidas
  const propinaRapida = [0, 1, 2, 5];

  function selectMetodo(id: string) {
    const metodo = metodosPago.find(m => m.id === id);
    if (metodo?.disabled) return;

    metodoSeleccionado = id;
    cobroCreado = null;
    error = null;

    // Reset efectivo inputs
    if (id === 'efectivo') {
      montoRecibido = 0;
    }
  }

  function selectPropina(valor: number) {
    propina = valor;
  }

  async function procesarCobro() {
    if (!metodoSeleccionado) return;
    if (metodoSeleccionado === 'efectivo' && montoRecibido < montoTotal) {
      error = 'Monto recibido insuficiente';
      return;
    }

    loading = true;
    error = null;

    try {
      const payload: any = {
        cuenta_id,
        project_id: project_id || undefined,
        pedido_ids,
        monto,
        metodo_pago: metodoSeleccionado,
        propina
      };

      if (metodoSeleccionado === 'efectivo') {
        payload.monto_recibido = montoRecibido;
      }

      const res = await mqttRequest('cobro', 'create', payload);

      if (res?.status === 201 && res?.data) {
        cobroCreado = res.data;

        // Para efectivo, tarjeta, bizum, transferencia: confirmar automáticamente
        if (['efectivo', 'tarjeta', 'bizum', 'transferencia'].includes(metodoSeleccionado)) {
          await confirmarCobro(res.data.id);
        }
        // Para link_pago y qr: mostrar URL/QR, no confirmar aún
      } else {
        error = res?.error || 'Error al crear cobro';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function confirmarCobro(cobro_id: string) {
    try {
      const res = await mqttRequest('cobro', 'confirm', { id: cobro_id });

      if (res?.status === 200) {
        // Efectivo con cambio: mostrar cambio, no cerrar aún
        if (cobroCreado?.cambio > 0) return;
        dispatch('success', { cobro_id, estado: 'completado' });
      } else {
        error = res?.error || 'Error al confirmar cobro';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    }
  }

  /** Cobrar + imprimir ticket de venta */
  async function cobrarEImprimir() {
    await procesarCobro();
    if (!error && cobroCreado) {
      await imprimirTicket();
    }
  }

  function handleClose() {
    dispatch('close');
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  // Impresión ticket
  let imprimiendo = false;
  let ticketImpreso = false;

  async function imprimirTicket() {
    if (!cobroCreado || imprimiendo) return;
    imprimiendo = true;
    try {
      const ticketItems = items.map(i => ({
        nombre: i.nombre || i.name,
        cantidad: i.cantidad || 1,
        precio_unitario: i.precio || i.precio_unitario || 0,
        precio_total: i.subtotal || (i.precio || 0) * (i.cantidad || 1)
      }));
      await imprimirTicketVenta({
        cuenta_id,
        items: ticketItems,
        total: cobroCreado.monto_total || montoTotal,
        metodo_pago: cobroCreado.metodo_pago || metodoSeleccionado || undefined,
        propina: propina || undefined,
        referencia_pago: cobroCreado.referencia_pago || undefined
      });
      ticketImpreso = true;
    } catch {
      // silencioso — el store de impresion ya loguea el error
    } finally {
      imprimiendo = false;
    }
  }

  // Botones rápidos de efectivo
  const billetes = [5, 10, 20, 50, 100];
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <div class="cuenta-info">
          <span class="cuenta-label">💶 Cobro</span>
          <span class="cuenta-total">{formatPrecio(montoTotal)}</span>
        </div>
        <div class="header-actions">
          <button class="cierre-btn" on:click={() => showCierreCaja = true} title="Cierre de caja">🔐</button>
          <button class="close-btn" on:click={handleClose}>✕</button>
        </div>
      </header>

      <!-- Content -->
      <div class="panel-content">
        {#if error}
          <div class="error">❌ {error}</div>
        {/if}

        {#if !cobroCreado}
          <!-- Métodos de pago -->
          <section class="section">
            <h3 class="section-title">🏷️ Método de pago</h3>
            <div class="metodos-grid">
              {#each metodosPago as metodo}
                <button
                  class="metodo-btn"
                  class:selected={metodoSeleccionado === metodo.id}
                  class:disabled={metodo.disabled}
                  disabled={metodo.disabled}
                  on:click={() => selectMetodo(metodo.id)}
                >
                  <span class="metodo-emoji">{metodo.emoji}</span>
                  <span class="metodo-nombre">{metodo.nombre}</span>
                </button>
              {/each}
            </div>
          </section>

          <!-- Propina -->
          <section class="section">
            <h3 class="section-title">💝 Propina</h3>
            <div class="propina-btns">
              {#each propinaRapida as valor}
                <button
                  class="propina-btn"
                  class:selected={propina === valor}
                  on:click={() => selectPropina(valor)}
                >
                  {valor === 0 ? 'Sin propina' : `+${valor} €`}
                </button>
              {/each}
            </div>
          </section>

          <!-- Efectivo: monto recibido -->
          {#if metodoSeleccionado === 'efectivo'}
            <section class="section">
              <h3 class="section-title">💵 Monto recibido</h3>
              <div class="efectivo-input">
                <input
                  type="number"
                  bind:value={montoRecibido}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  class="input-monto"
                  class:error={montoInsuficiente}
                />
                <span class="input-suffix">€</span>
              </div>

              <div class="billetes-grid">
                {#each billetes as billete}
                  <button
                    class="billete-btn"
                    on:click={() => montoRecibido = billete}
                  >
                    {billete} €
                  </button>
                {/each}
                <button
                  class="billete-btn exacto"
                  on:click={() => montoRecibido = montoTotal}
                >
                  Exacto
                </button>
              </div>

              {#if montoRecibido > 0}
                <div class="cambio-display" class:error={montoInsuficiente}>
                  {#if montoInsuficiente}
                    <span class="cambio-label">⚠️ Falta</span>
                    <span class="cambio-valor">{formatPrecio(montoTotal - montoRecibido)}</span>
                  {:else}
                    <span class="cambio-label">🔄 Cambio</span>
                    <span class="cambio-valor">{formatPrecio(cambio)}</span>
                  {/if}
                </div>
              {/if}
            </section>
          {/if}

          <!-- Resumen -->
          <section class="section resumen">
            <div class="resumen-row">
              <span>Subtotal</span>
              <span>{formatPrecio(monto)}</span>
            </div>
            {#if propina > 0}
              <div class="resumen-row propina">
                <span>💝 Propina</span>
                <span>+{formatPrecio(propina)}</span>
              </div>
            {/if}
            <div class="resumen-row total">
              <span>Total</span>
              <span>{formatPrecio(montoTotal)}</span>
            </div>
          </section>

        {:else if cobroCreado.cambio > 0}
          <!-- Efectivo con cambio -->
          <section class="section resultado">
            <div class="cambio-final">
              <span>🔄 Cambio a entregar:</span>
              <strong>{formatPrecio(cobroCreado.cambio)}</strong>
            </div>
          </section>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        {#if cobroCreado?.cambio > 0}
          <!-- Efectivo con cambio: imprimir opcional + cerrar -->
          <div class="footer-actions">
            <button
              class="action-btn print"
              disabled={imprimiendo}
              on:click={() => { imprimirTicket(); }}
            >
              {imprimiendo ? '🖨️...' : '🖨️'}
            </button>
            <button class="action-btn success" on:click={handleClose}>
              Cerrar
            </button>
          </div>
        {:else}
          <!-- Cobrar: con botón de imprimir al lado -->
          <div class="footer-actions">
            <button
              class="action-btn print"
              disabled={loading || imprimiendo || !metodoSeleccionado || (metodoSeleccionado === 'efectivo' && montoRecibido < montoTotal)}
              on:click={cobrarEImprimir}
              title="Cobrar e imprimir ticket"
            >
              {imprimiendo ? '🖨️...' : '🖨️'}
            </button>
            <button
              class="action-btn primary"
              disabled={loading || !metodoSeleccionado || (metodoSeleccionado === 'efectivo' && montoRecibido < montoTotal)}
              on:click={procesarCobro}
            >
              {#if loading}
                ⏳ Procesando...
              {:else}
                💶 Cobrar {formatPrecio(montoTotal)}
              {/if}
            </button>
          </div>
        {/if}
      </footer>
    </div>
  </div>

  {#if showCierreCaja}
    <CierreCajaPanel
      on:close={() => showCierreCaja = false}
    />
  {/if}
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .panel {
    background: #111;
    border: 1px solid #333;
    border-radius: 16px;
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid #222;
    background: #1a1a1a;
  }

  .cuenta-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cuenta-label {
    font-size: 0.85rem;
    color: #888;
  }

  .cuenta-total {
    font-size: 1.4rem;
    font-weight: 800;
    color: #22c55e;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cierre-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.3;
    transition: opacity 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .cierre-btn:hover,
  .cierre-btn:active {
    opacity: 0.8;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: #333;
    color: #888;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: #444;
    color: #fff;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 10px 12px;
    color: #ef4444;
    font-size: 0.85rem;
    margin-bottom: 16px;
  }

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0 0 10px 0;
  }

  /* Métodos grid */
  .metodos-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .metodo-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border: 2px solid #333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #ccc;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .metodo-btn:hover:not(:disabled) {
    border-color: #555;
  }

  .metodo-btn.selected {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .metodo-btn.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .metodo-emoji {
    font-size: 1.5rem;
  }

  .metodo-nombre {
    font-size: 0.65rem;
    font-weight: 600;
  }

  /* Propina */
  .propina-btns {
    display: flex;
    gap: 8px;
  }

  .propina-btn {
    flex: 1;
    padding: 10px 8px;
    border: 2px solid #333;
    border-radius: 8px;
    background: #1a1a1a;
    color: #ccc;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .propina-btn:hover {
    border-color: #555;
  }

  .propina-btn.selected {
    border-color: #ec4899;
    background: rgba(236, 72, 153, 0.15);
    color: #ec4899;
  }

  /* Efectivo */
  .efectivo-input {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .input-monto {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: right;
    outline: none;
  }

  .input-monto:focus {
    border-color: #22c55e;
  }

  .input-monto.error {
    border-color: #ef4444;
  }

  .input-suffix {
    font-size: 1.2rem;
    font-weight: 700;
    color: #888;
  }

  .billetes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .billete-btn {
    padding: 10px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #222;
    color: #ccc;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .billete-btn:hover {
    background: #333;
    color: #fff;
  }

  .billete-btn.exacto {
    background: #2a2a2a;
    border-color: #444;
  }

  .cambio-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid #22c55e;
    border-radius: 10px;
  }

  .cambio-display.error {
    background: rgba(239, 68, 68, 0.1);
    border-color: #ef4444;
  }

  .cambio-label {
    color: #22c55e;
    font-weight: 600;
  }

  .cambio-display.error .cambio-label {
    color: #ef4444;
  }

  .cambio-valor {
    font-size: 1.3rem;
    font-weight: 800;
    color: #22c55e;
  }

  .cambio-display.error .cambio-valor {
    color: #ef4444;
  }

  /* Resumen */
  .resumen {
    background: #1a1a1a;
    border-radius: 10px;
    padding: 12px 16px;
  }

  .resumen-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #888;
    padding: 4px 0;
  }

  .resumen-row.propina {
    color: #ec4899;
  }

  .resumen-row.total {
    border-top: 1px solid #333;
    margin-top: 8px;
    padding-top: 8px;
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }

  /* Resultado */
  .resultado {
    text-align: center;
    padding: 24px 16px;
  }

  .resultado-icon {
    font-size: 3rem;
    margin-bottom: 12px;
  }

  .resultado-icon.success {
    animation: pulse 0.5s ease-out;
  }

  @keyframes pulse {
    0% { transform: scale(0.8); opacity: 0; }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
  }

  .resultado-titulo {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    margin: 0 0 8px 0;
  }

  .resultado-ref {
    font-size: 0.8rem;
    color: #666;
    margin: 0;
  }

  .cambio-final {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 16px;
    padding: 16px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 10px;
    color: #22c55e;
  }

  .cambio-final strong {
    font-size: 1.5rem;
  }

  .link-url {
    display: block;
    word-break: break-all;
    color: #3b82f6;
    font-size: 0.8rem;
    margin: 8px 0;
  }

  .expira {
    font-size: 0.75rem;
    color: #666;
    margin: 8px 0 0 0;
  }

  .qr-placeholder {
    margin: 16px auto;
    width: 150px;
    height: 150px;
    background: #fff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qr-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* Footer */
  .panel-footer {
    padding: 16px;
    border-top: 1px solid #222;
    background: #1a1a1a;
  }

  .action-btn {
    width: 100%;
    padding: 14px;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.primary {
    background: #22c55e;
    color: #fff;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #16a34a;
  }

  .action-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .footer-actions {
    display: flex;
    gap: 10px;
  }

  .action-btn.print {
    width: auto;
    min-width: 48px;
    padding: 14px 16px;
    background: #333;
    color: #ccc;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .action-btn.print:hover:not(:disabled) {
    background: #444;
    color: #fff;
  }

  .action-btn.print:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.success {
    background: #22c55e;
    color: #fff;
  }

  .action-btn.secondary {
    background: #333;
    color: #ccc;
  }

  .action-btn.secondary:hover {
    background: #444;
  }

  /* Mobile */
  @media (max-width: 400px) {
    .metodos-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .metodo-emoji {
      font-size: 1.3rem;
    }

    .billetes-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
