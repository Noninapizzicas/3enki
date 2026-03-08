<script lang="ts">
  /**
   * CierreCajaPanel — Cierre ciego de caja
   *
   * El usuario solo cuenta dinero físico (billetes + monedas).
   * No ve ventas, totales, ni información sensible.
   * Los datos se envían al backend que hace la comparación.
   */
  import { createEventDispatcher } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  // Fases: conteo → enviado → resultado
  let fase: 'conteo' | 'enviado' | 'resultado' = 'conteo';
  let loading = false;
  let error: string | null = null;

  // Billetes: cantidad por denominación
  let billetes: Record<number, number> = {
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0
  };

  // Monedas: cantidad por denominación
  let monedas: Record<number, number> = {
    2: 0, 1: 0, 0.5: 0, 0.2: 0, 0.1: 0, 0.05: 0, 0.02: 0, 0.01: 0
  };

  // Resultado del cierre (viene del backend)
  let cierreResult: any = null;

  $: totalBilletes = Object.entries(billetes).reduce((sum, [den, qty]) => sum + Number(den) * qty, 0);
  $: totalMonedas = Object.entries(monedas).reduce((sum, [den, qty]) => sum + Number(den) * qty, 0);
  $: totalContado = totalBilletes + totalMonedas;

  function incrementar(tipo: 'billetes' | 'monedas', den: number) {
    if (tipo === 'billetes') {
      billetes[den] = (billetes[den] || 0) + 1;
      billetes = billetes; // trigger reactivity
    } else {
      monedas[den] = (monedas[den] || 0) + 1;
      monedas = monedas;
    }
  }

  function decrementar(tipo: 'billetes' | 'monedas', den: number) {
    if (tipo === 'billetes') {
      if (billetes[den] > 0) billetes[den]--;
      billetes = billetes;
    } else {
      if (monedas[den] > 0) monedas[den]--;
      monedas = monedas;
    }
  }

  function resetConteo() {
    billetes = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 };
    monedas = { 2: 0, 1: 0, 0.5: 0, 0.2: 0, 0.1: 0, 0.05: 0, 0.02: 0, 0.01: 0 };
  }

  async function enviarConteo() {
    loading = true;
    error = null;
    try {
      const res = await mqttRequest<any>('persistencia', 'cierre', {
        arqueo: {
          billetes: { ...billetes },
          monedas: { ...monedas },
          total_contado: totalContado
        }
      });
      if (res?.status === 200 && res?.data) {
        cierreResult = res.data.data?.cierre || res.data.cierre || res.data;
        fase = 'resultado';
      } else {
        error = res?.error || 'Error al cerrar caja';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function iniciarNuevoDia() {
    loading = true;
    error = null;
    try {
      const res = await mqttRequest<any>('persistencia', 'iniciar_dia', {});
      if (res?.status === 200) {
        dispatch('close');
      } else {
        error = res?.error || 'Error al iniciar día';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  function formatDenominacion(den: number): string {
    return den >= 1 ? den + ' €' : (den * 100).toFixed(0) + ' ct';
  }
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <span class="header-label">🔐 Cierre de Caja</span>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>

      <!-- Content -->
      <div class="panel-content">
        {#if error}
          <div class="error-msg">❌ {error}</div>
        {/if}

        {#if fase === 'conteo'}
          <!-- Billetes -->
          <section class="section">
            <h3 class="section-title">💵 Billetes</h3>
            <div class="conteo-grid">
              {#each Object.entries(billetes).sort((a, b) => Number(b[0]) - Number(a[0])) as [den, qty]}
                <div class="conteo-row">
                  <span class="den-label">{Number(den)} €</span>
                  <div class="conteo-controls">
                    <button class="ctrl-btn minus" on:click={() => decrementar('billetes', Number(den))} disabled={qty === 0}>−</button>
                    <span class="qty" class:has-value={qty > 0}>{qty}</span>
                    <button class="ctrl-btn plus" on:click={() => incrementar('billetes', Number(den))}>+</button>
                  </div>
                  <span class="row-total" class:has-value={qty > 0}>{(Number(den) * qty).toFixed(2)}</span>
                </div>
              {/each}
            </div>
            <div class="subtotal">
              <span>Subtotal billetes</span>
              <strong>{formatPrecio(totalBilletes)}</strong>
            </div>
          </section>

          <!-- Monedas -->
          <section class="section">
            <h3 class="section-title">🪙 Monedas</h3>
            <div class="conteo-grid">
              {#each Object.entries(monedas).sort((a, b) => Number(b[0]) - Number(a[0])) as [den, qty]}
                <div class="conteo-row">
                  <span class="den-label">{formatDenominacion(Number(den))}</span>
                  <div class="conteo-controls">
                    <button class="ctrl-btn minus" on:click={() => decrementar('monedas', Number(den))} disabled={qty === 0}>−</button>
                    <span class="qty" class:has-value={qty > 0}>{qty}</span>
                    <button class="ctrl-btn plus" on:click={() => incrementar('monedas', Number(den))}>+</button>
                  </div>
                  <span class="row-total" class:has-value={qty > 0}>{(Number(den) * qty).toFixed(2)}</span>
                </div>
              {/each}
            </div>
            <div class="subtotal">
              <span>Subtotal monedas</span>
              <strong>{formatPrecio(totalMonedas)}</strong>
            </div>
          </section>

          <!-- Total contado -->
          <div class="total-box">
            <span>Total contado</span>
            <strong>{formatPrecio(totalContado)}</strong>
          </div>

        {:else if fase === 'resultado'}
          <!-- Resultado del cierre -->
          <div class="resultado">
            <div class="resultado-icon">✅</div>
            <h3 class="resultado-titulo">Caja cerrada</h3>
            {#if cierreResult?.fecha_jornada || cierreResult?.fecha}
              <p class="resultado-info">
                Jornada: {cierreResult.fecha_jornada || cierreResult.fecha}
              </p>
            {/if}
            <p class="resultado-contado">Contado: {formatPrecio(totalContado)}</p>
            {#if cierreResult?.cuentas_cerradas_forzadas?.length > 0}
              <p class="resultado-forzadas">
                {cierreResult.cuentas_cerradas_forzadas.length} cuenta{cierreResult.cuentas_cerradas_forzadas.length > 1 ? 's' : ''} abierta{cierreResult.cuentas_cerradas_forzadas.length > 1 ? 's' : ''} cerrada{cierreResult.cuentas_cerradas_forzadas.length > 1 ? 's' : ''} automáticamente
              </p>
            {/if}
            <p class="resultado-envio">Informe enviado</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        {#if fase === 'conteo'}
          <div class="footer-btns">
            <button class="action-btn secondary" on:click={resetConteo}>
              🔄 Reset
            </button>
            <button class="action-btn danger" on:click={enviarConteo} disabled={loading || totalContado === 0}>
              {loading ? '⏳...' : '🔐 Cerrar caja'}
            </button>
          </div>
        {:else if fase === 'resultado'}
          <div class="footer-btns">
            <button class="action-btn secondary" on:click={handleClose}>
              Cerrar
            </button>
            <button class="action-btn primary" on:click={iniciarNuevoDia} disabled={loading}>
              {loading ? '⏳...' : '🌅 Nuevo día'}
            </button>
          </div>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: 16px;
  }

  .panel {
    background: #111;
    border: 1px solid #333;
    border-radius: 16px;
    width: 100%;
    max-width: 400px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid #222;
    background: #1a1a1a;
  }

  .header-label {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
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

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .error-msg {
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
    margin: 0 0 8px 0;
  }

  /* Conteo grid */
  .conteo-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .conteo-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #1a1a1a;
    border-radius: 8px;
  }

  .den-label {
    width: 50px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #999;
    text-align: right;
    flex-shrink: 0;
  }

  .conteo-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    justify-content: center;
  }

  .ctrl-btn {
    width: 32px;
    height: 32px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #222;
    color: #ccc;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .ctrl-btn:active:not(:disabled) {
    background: #444;
  }

  .ctrl-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .ctrl-btn.plus {
    border-color: #22c55e44;
    color: #22c55e;
  }

  .ctrl-btn.minus {
    border-color: #ef444444;
    color: #ef4444;
  }

  .qty {
    min-width: 28px;
    text-align: center;
    font-size: 1rem;
    font-weight: 700;
    color: #555;
    font-variant-numeric: tabular-nums;
  }

  .qty.has-value {
    color: #fff;
  }

  .row-total {
    width: 60px;
    text-align: right;
    font-size: 0.8rem;
    font-weight: 600;
    color: #444;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .row-total.has-value {
    color: #ccc;
  }

  /* Subtotal */
  .subtotal {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    margin-top: 4px;
    font-size: 0.8rem;
    color: #888;
  }

  .subtotal strong {
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  /* Total box */
  .total-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid #f59e0b;
    border-radius: 10px;
    color: #f59e0b;
    font-size: 1rem;
    font-weight: 700;
  }

  .total-box strong {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
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

  .resultado-titulo {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    margin: 0 0 8px 0;
  }

  .resultado-info {
    font-size: 0.8rem;
    color: #666;
    margin: 0 0 4px 0;
  }

  .resultado-contado {
    font-size: 0.9rem;
    color: #f59e0b;
    font-weight: 600;
    margin: 0 0 8px 0;
  }

  .resultado-forzadas {
    font-size: 0.8rem;
    color: #f59e0b;
    margin: 0 0 4px 0;
    padding: 6px 12px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 6px;
    display: inline-block;
  }

  .resultado-envio {
    font-size: 0.75rem;
    color: #666;
    margin: 8px 0 0 0;
  }

  /* Footer */
  .panel-footer {
    padding: 16px;
    border-top: 1px solid #222;
    background: #1a1a1a;
  }

  .footer-btns {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    flex: 1;
    padding: 14px;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: #22c55e;
    color: #fff;
  }

  .action-btn.secondary {
    background: #333;
    color: #ccc;
  }

  .action-btn.danger {
    background: #ef4444;
    color: #fff;
  }
</style>
