<script lang="ts">
  /**
   * CierreCajaPanel — Panel flotante para cierre de caja
   *
   * Flujo:
   *  1. Muestra resumen de jornada (ventas, métodos, totales)
   *  2. Input de arqueo: efectivo + monedas contadas
   *  3. Muestra diferencia (cuadrado/sobrante/faltante)
   *  4. Botón confirmar cierre
   *  5. Resultado: cierre completado → iniciar nuevo día
   */
  import { createEventDispatcher } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  // Fases: resumen → arqueo → resultado
  let fase: 'resumen' | 'arqueo' | 'resultado' = 'resumen';
  let loading = false;
  let error: string | null = null;

  // Datos de resumen
  let resumen: any = null;
  let jornada: any = null;

  // Datos de arqueo
  let arqueoEfectivo: number = 0;
  let arqueoMonedas: number = 0;

  // Resultado cierre
  let cierreResult: any = null;

  $: totalArqueado = arqueoEfectivo + arqueoMonedas;
  $: esperadoEfectivo = resumen?.por_metodo_pago?.efectivo || 0;
  $: diferencia = totalArqueado - esperadoEfectivo;
  $: estadoCaja = diferencia === 0 ? 'cuadrado' : (diferencia > 0 ? 'sobrante' : 'faltante');

  async function cargarResumen() {
    loading = true;
    error = null;
    try {
      // Cargar cuadre de caja
      const res = await mqttRequest<any>('persistencia', 'cuadre', {});
      if (res?.status === 200 && res?.data) {
        resumen = res.data.data || res.data;
      }
      // Cargar info jornada
      const healthRes = await mqttRequest<any>('persistencia', 'health', {});
      if (healthRes?.status === 200) {
        jornada = healthRes.data?.data || healthRes.data;
      }
    } catch (err: any) {
      error = err?.message || 'Error cargando resumen';
    } finally {
      loading = false;
    }
  }

  function irArqueo() {
    fase = 'arqueo';
  }

  async function confirmarCierre() {
    loading = true;
    error = null;
    try {
      const res = await mqttRequest<any>('persistencia', 'cierre', {
        arqueo: {
          efectivo: arqueoEfectivo,
          monedas: arqueoMonedas
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
    return (precio || 0).toFixed(2) + ' €';
  }

  // Cargar al abrir
  $: if (visible) cargarResumen();
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <div class="header-info">
          <span class="header-label">🔐 Cierre de Caja</span>
          {#if jornada?.fecha_jornada}
            <span class="header-fecha">Jornada: {jornada.fecha_jornada}</span>
          {/if}
        </div>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>

      <!-- Content -->
      <div class="panel-content">
        {#if error}
          <div class="error-msg">❌ {error}</div>
        {/if}

        {#if loading && !resumen}
          <div class="loading">⏳ Cargando...</div>

        {:else if fase === 'resumen'}
          <!-- FASE 1: Resumen de jornada -->
          {#if resumen}
            <section class="section">
              <h3 class="section-title">📊 Resumen del día</h3>
              <div class="stat-grid">
                <div class="stat">
                  <span class="stat-value">{resumen.total_ventas || 0}</span>
                  <span class="stat-label">Ventas</span>
                </div>
                <div class="stat">
                  <span class="stat-value">{formatPrecio(resumen.total_ingresos)}</span>
                  <span class="stat-label">Ingresos</span>
                </div>
                <div class="stat">
                  <span class="stat-value">{formatPrecio(resumen.total_propinas)}</span>
                  <span class="stat-label">Propinas</span>
                </div>
              </div>
            </section>

            <section class="section">
              <h3 class="section-title">💳 Por método de pago</h3>
              <div class="metodo-list">
                {#each Object.entries(resumen.por_metodo_pago || {}) as [metodo, total]}
                  <div class="metodo-row">
                    <span class="metodo-name">
                      {metodo === 'efectivo' ? '💵' : metodo === 'tarjeta' ? '💳' : metodo === 'bizum' ? '📱' : '🏦'}
                      {metodo}
                    </span>
                    <span class="metodo-total">{formatPrecio(Number(total))}</span>
                  </div>
                {/each}
              </div>
            </section>

            {#if resumen.por_tipo_cuenta}
              <section class="section">
                <h3 class="section-title">📋 Por tipo</h3>
                <div class="metodo-list">
                  {#each Object.entries(resumen.por_tipo_cuenta || {}) as [tipo, total]}
                    {#if Number(total) > 0}
                      <div class="metodo-row">
                        <span class="metodo-name">
                          {tipo === 'mesa' ? '🏠' : tipo === 'telefono' ? '🛵' : tipo === 'llevar' ? '📦' : '📋'}
                          {tipo}
                        </span>
                        <span class="metodo-total">{formatPrecio(Number(total))}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              </section>
            {/if}

            <div class="total-box">
              <span>Total jornada</span>
              <strong>{formatPrecio(resumen.total_ingresos)}</strong>
            </div>
          {:else}
            <div class="empty">Sin datos de ventas</div>
          {/if}

        {:else if fase === 'arqueo'}
          <!-- FASE 2: Arqueo de caja -->
          <section class="section">
            <h3 class="section-title">💵 Efectivo esperado</h3>
            <div class="esperado-box">
              <span>{formatPrecio(esperadoEfectivo)}</span>
            </div>
          </section>

          <section class="section">
            <h3 class="section-title">🔢 Arqueo: dinero contado</h3>
            <div class="arqueo-row">
              <label class="arqueo-label">Billetes</label>
              <div class="arqueo-input-wrap">
                <input
                  type="number"
                  bind:value={arqueoEfectivo}
                  min="0"
                  step="0.01"
                  class="arqueo-input"
                  placeholder="0.00"
                />
                <span class="input-suffix">€</span>
              </div>
            </div>
            <div class="arqueo-row">
              <label class="arqueo-label">Monedas</label>
              <div class="arqueo-input-wrap">
                <input
                  type="number"
                  bind:value={arqueoMonedas}
                  min="0"
                  step="0.01"
                  class="arqueo-input"
                  placeholder="0.00"
                />
                <span class="input-suffix">€</span>
              </div>
            </div>
          </section>

          <section class="section">
            <div class="diferencia-box" class:cuadrado={estadoCaja === 'cuadrado'} class:sobrante={estadoCaja === 'sobrante'} class:faltante={estadoCaja === 'faltante'}>
              <div class="dif-header">
                <span>Total contado</span>
                <strong>{formatPrecio(totalArqueado)}</strong>
              </div>
              <div class="dif-line"></div>
              <div class="dif-header">
                <span>Diferencia</span>
                <strong>{diferencia >= 0 ? '+' : ''}{formatPrecio(diferencia)}</strong>
              </div>
              <span class="dif-estado">
                {estadoCaja === 'cuadrado' ? '✅ Cuadrado' : estadoCaja === 'sobrante' ? '⬆️ Sobrante' : '⬇️ Faltante'}
              </span>
            </div>
          </section>

        {:else if fase === 'resultado'}
          <!-- FASE 3: Resultado -->
          <div class="resultado">
            <div class="resultado-icon">✅</div>
            <h3 class="resultado-titulo">Caja cerrada</h3>
            {#if cierreResult}
              <p class="resultado-info">
                Jornada: {cierreResult.fecha_jornada || cierreResult.fecha}
              </p>
              <div class="resultado-estado" class:cuadrado={cierreResult.estado === 'cuadrado'} class:sobrante={cierreResult.estado === 'sobrante'} class:faltante={cierreResult.estado === 'faltante'}>
                {cierreResult.estado === 'cuadrado' ? '✅' : cierreResult.estado === 'sobrante' ? '⬆️' : '⬇️'}
                {cierreResult.estado}
                {#if cierreResult.diferencia !== 0}
                  ({cierreResult.diferencia >= 0 ? '+' : ''}{formatPrecio(cierreResult.diferencia)})
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        {#if fase === 'resumen'}
          <button class="action-btn primary" on:click={irArqueo} disabled={loading}>
            🔢 Hacer arqueo
          </button>
        {:else if fase === 'arqueo'}
          <div class="footer-btns">
            <button class="action-btn secondary" on:click={() => fase = 'resumen'}>
              ← Volver
            </button>
            <button class="action-btn danger" on:click={confirmarCierre} disabled={loading}>
              {loading ? '⏳...' : '🔐 Cerrar caja'}
            </button>
          </div>
        {:else if fase === 'resultado'}
          <div class="footer-btns">
            <button class="action-btn secondary" on:click={handleClose}>
              Cerrar
            </button>
            <button class="action-btn primary" on:click={iniciarNuevoDia} disabled={loading}>
              {loading ? '⏳...' : '🌅 Iniciar nuevo día'}
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
    max-width: 420px;
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

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .header-label {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }

  .header-fecha {
    font-size: 0.75rem;
    color: #666;
    font-variant-numeric: tabular-nums;
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

  .loading, .empty {
    text-align: center;
    padding: 32px;
    color: #666;
    font-size: 0.9rem;
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

  /* Stats grid */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    background: #1a1a1a;
    border-radius: 10px;
    border: 1px solid #222;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 800;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 0.6rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Método list */
  .metodo-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metodo-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #1a1a1a;
    border-radius: 8px;
  }

  .metodo-name {
    font-size: 0.85rem;
    color: #ccc;
    text-transform: capitalize;
  }

  .metodo-total {
    font-size: 0.85rem;
    font-weight: 700;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  /* Total box */
  .total-box {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid #22c55e;
    border-radius: 10px;
    color: #22c55e;
    font-size: 1rem;
    font-weight: 700;
  }

  .total-box strong {
    font-size: 1.2rem;
  }

  /* Arqueo */
  .esperado-box {
    padding: 14px 16px;
    background: #1a1a1a;
    border-radius: 10px;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 800;
    color: #22c55e;
    font-variant-numeric: tabular-nums;
  }

  .arqueo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .arqueo-label {
    width: 70px;
    font-size: 0.85rem;
    color: #888;
    flex-shrink: 0;
  }

  .arqueo-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .arqueo-input {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 700;
    text-align: right;
    outline: none;
  }

  .arqueo-input:focus {
    border-color: #f59e0b;
  }

  .input-suffix {
    font-size: 1rem;
    font-weight: 700;
    color: #888;
  }

  /* Diferencia */
  .diferencia-box {
    padding: 16px;
    border-radius: 10px;
    border: 2px solid #333;
    background: #1a1a1a;
  }

  .diferencia-box.cuadrado {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.08);
  }

  .diferencia-box.sobrante {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  .diferencia-box.faltante {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .dif-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #ccc;
    padding: 4px 0;
  }

  .dif-header strong {
    font-variant-numeric: tabular-nums;
  }

  .dif-line {
    height: 1px;
    background: #333;
    margin: 8px 0;
  }

  .dif-estado {
    display: block;
    text-align: center;
    margin-top: 10px;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .cuadrado .dif-estado { color: #22c55e; }
  .sobrante .dif-estado { color: #f59e0b; }
  .faltante .dif-estado { color: #ef4444; }

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
    margin: 0 0 12px 0;
  }

  .resultado-estado {
    display: inline-block;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.9rem;
    text-transform: capitalize;
  }

  .resultado-estado.cuadrado { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
  .resultado-estado.sobrante { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .resultado-estado.faltante { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

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

  @media (max-width: 400px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .stat-value { font-size: 0.85rem; }
  }
</style>
