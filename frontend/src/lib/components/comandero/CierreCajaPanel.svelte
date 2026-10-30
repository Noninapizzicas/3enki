<script lang="ts">
  /**
   * CierreCajaPanel — Cierre ciego de caja
   *
   * El camarero solo declara lo que ha contado: efectivo (billetes + monedas),
   * tarjeta, bizum, propinas y retiradas. No ve ninguna cifra calculada por el
   * sistema: el cruce se hace en el backend y viaja al propietario. Es ciego por
   * diseño, para que nadie pueda "cuadrar la caja a mano".
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

  // --- Apertura de día: fondo inicial (accesible ANTES de contar) ---
  let fondoInicialInput = '0';
  let fondoAbierto: number | null = null;

  // Billetes: cantidad por denominación
  let billetes: Record<number, number> = {
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0
  };

  // Monedas: cantidad por denominación
  let monedas: Record<number, number> = {
    2: 0, 1: 0, 0.5: 0, 0.2: 0, 0.1: 0, 0.05: 0, 0.02: 0, 0.01: 0
  };

  // --- Arqueo por método ---
  // Se guardan como texto para distinguir "vacío" (se envía null) de "0" (se envía 0).
  let tarjetaInput = '';
  let bizumInput = '';
  let propinasInput = '';

  type Retirada = { importe: string; motivo: string };
  let retiradas: Retirada[] = [];

  // Recibo congelado al enviar: SOLO cifras tecleadas por el camarero, nunca del sistema.
  let recibo: {
    efectivo: number;
    tarjeta: number | null;
    bizum: number | null;
    propinas: number | null;
    retiradas: Array<{ importe: number; motivo: string }>;
    total: number;
  } | null = null;

  // Respuesta del cierre: únicamente se usa la fecha de jornada y el número de
  // cuentas cerradas a la fuerza (sin importes) para el recibo.
  let cierreResult: any = null;

  $: totalBilletes = Object.entries(billetes).reduce((sum, [den, qty]) => sum + Number(den) * qty, 0);
  $: totalMonedas = Object.entries(monedas).reduce((sum, [den, qty]) => sum + Number(den) * qty, 0);
  $: totalContado = redondear(totalBilletes + totalMonedas);

  $: tarjeta = importe(tarjetaInput);
  $: bizum = importe(bizumInput);
  $: propinas = importe(propinasInput);
  $: retiradasTotal = redondear(retiradas.reduce((sum, r) => sum + importe(r.importe), 0));
  // Total declarado = lo que el camarero ha tecleado, sumado por nosotros (no es cifra del sistema).
  $: totalDeclarado = redondear(totalContado + tarjeta + bizum + propinas - retiradasTotal);

  /** Redondeo a céntimos para no arrastrar errores de coma flotante. */
  function redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** '' → null (campo vacío); texto no numérico → NaN; acepta coma decimal. */
  function parseImporte(valor: string): number | null {
    const limpio = (valor ?? '').replace(',', '.').trim();
    if (limpio === '') return null;
    return Number(limpio);
  }

  /** Igual que parseImporte pero tratando vacío/inválido como 0 (solo para sumar en pantalla). */
  function importe(valor: string): number {
    const n = parseImporte(valor);
    return n !== null && Number.isFinite(n) ? n : 0;
  }

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
    tarjetaInput = '';
    bizumInput = '';
    propinasInput = '';
    retiradas = [];
  }

  // --- Retiradas: filas repetibles (importe + motivo) ---
  function addRetirada() {
    retiradas = [...retiradas, { importe: '', motivo: '' }];
  }

  function removeRetirada(i: number) {
    retiradas = retiradas.filter((_, idx) => idx !== i);
  }

  function actualizarRetirada(i: number, campo: 'importe' | 'motivo', valor: string) {
    retiradas = retiradas.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r));
  }

  /** Valida el arqueo ANTES de enviar; devuelve el mensaje de error o null. */
  function validarArqueo(): string | null {
    const campos: Array<[string, string]> = [
      ['tarjeta', tarjetaInput],
      ['bizum', bizumInput],
      ['propinas', propinasInput]
    ];
    for (const [nombre, valor] of campos) {
      const n = parseImporte(valor);
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        return `Importe de ${nombre} no válido (número ≥ 0)`;
      }
    }
    for (const r of retiradas) {
      if (r.importe.trim() === '') return 'Cada retirada necesita un importe';
      const n = parseImporte(r.importe);
      if (n === null || !Number.isFinite(n) || n < 0) return 'Importe de retirada no válido (número ≥ 0)';
      if (r.motivo.trim() === '') return 'Cada retirada necesita un motivo';
    }
    return null;
  }

  async function abrirDia(cerrarAlTerminar = false) {
    error = null;
    const fondo = parseImporte(fondoInicialInput) ?? 0;
    if (!Number.isFinite(fondo) || fondo < 0) {
      error = 'El fondo inicial debe ser un número ≥ 0';
      return;
    }
    loading = true;
    try {
      const res = await mqttRequest<any>('persistencia', 'iniciar_dia', {
        fondo_inicial: redondear(fondo)
      });
      if (res?.status === 200) {
        fondoAbierto = redondear(fondo);
        if (cerrarAlTerminar) dispatch('close');
      } else {
        error = res?.error?.message || 'Error al abrir el día';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function enviarConteo() {
    const problema = validarArqueo();
    if (problema) {
      error = problema;
      return;
    }
    loading = true;
    error = null;
    try {
      const efectivo = redondear(totalContado);
      const tarjetaVal = parseImporte(tarjetaInput);
      const bizumVal = parseImporte(bizumInput);
      const propinasVal = parseImporte(propinasInput);
      const retiradasPayload = retiradas.map((r) => ({
        importe: redondear(importe(r.importe)),
        motivo: r.motivo.trim()
      }));

      // Congelamos el recibo ANTES de enviar: es lo único que verá el camarero.
      recibo = {
        efectivo,
        tarjeta: tarjetaVal === null ? null : redondear(tarjetaVal),
        bizum: bizumVal === null ? null : redondear(bizumVal),
        propinas: propinasVal === null ? null : redondear(propinasVal),
        retiradas: retiradasPayload,
        total: totalDeclarado
      };

      const res = await mqttRequest<any>('persistencia', 'cierre', {
        arqueo: {
          billetes: { ...billetes },
          monedas: { ...monedas },
          efectivo,
          total_contado: efectivo,
          tarjeta: tarjetaVal === null ? null : redondear(tarjetaVal),
          bizum: bizumVal === null ? null : redondear(bizumVal),
          propinas: propinasVal === null ? null : redondear(propinasVal),
          retiradas: retiradasPayload
        }
      });
      if (res?.status === 200 && res?.data) {
        // Cierre ciego: del cierre NO se guarda nada con cifras del sistema. Solo la fecha y
        // cuantas cuentas se cerraron a la fuerza (el dato no revela importes).
        const c = res.data.data?.cierre || res.data.cierre || res.data || {};
        cierreResult = {
          fecha_jornada: c.fecha_jornada || c.fecha || null,
          cuentas_forzadas: Array.isArray(c.cuentas_cerradas_forzadas)
            ? c.cuentas_cerradas_forzadas.length : 0
        };
        fase = 'resultado';
      } else {
        recibo = null;
        error = res?.error?.message || 'Error al cerrar caja';
      }
    } catch (err: any) {
      recibo = null;
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

  /** Importe opcional en el recibo: si no se tecleó, se marca como "—". */
  function formatOpcional(valor: number | null): string {
    return valor === null ? '—' : formatPrecio(valor);
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
          <!-- Apertura de día: fondo inicial (siempre accesible antes de contar) -->
          <section class="section">
            <h3 class="section-title">🌅 Apertura de día</h3>
            <div class="apertura">
              <div class="field-row">
                <span class="field-label">Fondo inicial de caja</span>
                <input
                  class="money-input"
                  type="text"
                  inputmode="decimal"
                  placeholder="0,00"
                  bind:value={fondoInicialInput}
                />
                <button class="apertura-btn" on:click={() => abrirDia(false)} disabled={loading}>
                  Abrir día
                </button>
              </div>
              {#if fondoAbierto !== null}
                <p class="apertura-ok">Día abierto · fondo {formatPrecio(fondoAbierto)}</p>
              {/if}
            </div>
          </section>

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
            <span>Efectivo contado</span>
            <strong>{formatPrecio(totalContado)}</strong>
          </div>

          <!-- Arqueo por método -->
          <section class="section">
            <h3 class="section-title">💳 Otros métodos</h3>
            <div class="field-row">
              <span class="field-label">Tarjeta (datáfono)</span>
              <input class="money-input" type="text" inputmode="decimal" placeholder="0,00" bind:value={tarjetaInput} />
            </div>
            <div class="field-row">
              <span class="field-label">Bizum</span>
              <input class="money-input" type="text" inputmode="decimal" placeholder="0,00" bind:value={bizumInput} />
            </div>
            <div class="field-row">
              <span class="field-label">Propinas</span>
              <input class="money-input" type="text" inputmode="decimal" placeholder="0,00" bind:value={propinasInput} />
            </div>
          </section>

          <!-- Retiradas de caja -->
          <section class="section">
            <h3 class="section-title">📤 Retiradas de caja</h3>
            {#if retiradas.length === 0}
              <p class="empty-hint">Sin retiradas</p>
            {/if}
            {#each retiradas as r, i (i)}
              <div class="retirada-row">
                <input
                  class="money-input"
                  type="text"
                  inputmode="decimal"
                  placeholder="Importe"
                  value={r.importe}
                  on:input={(e) => actualizarRetirada(i, 'importe', e.currentTarget.value)}
                />
                <input
                  class="motivo-input"
                  type="text"
                  placeholder="Motivo"
                  value={r.motivo}
                  on:input={(e) => actualizarRetirada(i, 'motivo', e.currentTarget.value)}
                />
                <button class="remove-btn" title="Quitar" on:click={() => removeRetirada(i)}>✕</button>
              </div>
            {/each}
            <button class="add-btn" on:click={addRetirada}>＋ Añadir retirada</button>
            {#if retiradas.length > 0}
              <div class="subtotal">
                <span>Total retiradas</span>
                <strong>{formatPrecio(retiradasTotal)}</strong>
              </div>
            {/if}
          </section>

          <!-- Total declarado (solo suma de lo tecleado, no es cifra del sistema) -->
          <div class="total-box declarado">
            <span>Total declarado</span>
            <strong>{formatPrecio(totalDeclarado)}</strong>
          </div>

        {:else if fase === 'resultado'}
          <!-- Resultado CIEGO: solo el recibo de lo tecleado, ninguna cifra del sistema. -->
          <div class="resultado">
            <div class="resultado-icon">✅</div>
            <h3 class="resultado-titulo">Cierre registrado</h3>
            {#if cierreResult?.fecha_jornada || cierreResult?.fecha}
              <p class="resultado-info">
                Jornada: {cierreResult.fecha_jornada || cierreResult.fecha}
              </p>
            {/if}

            {#if recibo}
              <div class="recibo">
                <div class="recibo-row">
                  <span>Efectivo contado</span>
                  <strong>{formatPrecio(recibo.efectivo)}</strong>
                </div>
                <div class="recibo-row">
                  <span>Tarjeta</span>
                  <strong>{formatOpcional(recibo.tarjeta)}</strong>
                </div>
                <div class="recibo-row">
                  <span>Bizum</span>
                  <strong>{formatOpcional(recibo.bizum)}</strong>
                </div>
                <div class="recibo-row">
                  <span>Propinas</span>
                  <strong>{formatOpcional(recibo.propinas)}</strong>
                </div>
                {#each recibo.retiradas as r, i (i)}
                  <div class="recibo-row">
                    <span>Retirada <span class="recibo-motivo">({r.motivo})</span></span>
                    <strong>−{formatPrecio(r.importe)}</strong>
                  </div>
                {/each}
                <div class="recibo-row total">
                  <span>Total declarado</span>
                  <strong>{formatPrecio(recibo.total)}</strong>
                </div>
              </div>
            {/if}

            {#if cierreResult?.cuentas_forzadas > 0}
              <p class="resultado-forzadas">
                {cierreResult.cuentas_forzadas} cuenta{cierreResult.cuentas_forzadas > 1 ? 's' : ''} abierta{cierreResult.cuentas_forzadas > 1 ? 's' : ''} cerrada{cierreResult.cuentas_forzadas > 1 ? 's' : ''} automáticamente
              </p>
            {/if}

            <p class="resultado-envio">Cierre registrado. El cuadre se envía al propietario.</p>
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
            <button class="action-btn danger" on:click={enviarConteo} disabled={loading || totalDeclarado <= 0}>
              {loading ? '⏳...' : '🔐 Cerrar caja'}
            </button>
          </div>
        {:else if fase === 'resultado'}
          <div class="footer-btns">
            <button class="action-btn secondary" on:click={handleClose}>
              Cerrar
            </button>
            <button class="action-btn primary" on:click={() => abrirDia(true)} disabled={loading}>
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
    margin-bottom: 20px;
  }

  .total-box strong {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }

  .total-box.declarado {
    margin-top: 4px;
    background: rgba(34, 197, 94, 0.1);
    border-color: #22c55e;
    color: #22c55e;
  }

  /* Apertura de día */
  .apertura {
    padding: 10px;
    background: #1a1a1a;
    border-radius: 10px;
  }

  .apertura-ok {
    margin: 6px 0 0 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: #22c55e;
  }

  .apertura-btn {
    padding: 8px 12px;
    border: 1px solid #22c55e55;
    border-radius: 8px;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .apertura-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Campos de importe */
  .field-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #1a1a1a;
    border-radius: 8px;
    margin-bottom: 4px;
  }

  .field-label {
    flex: 1;
    min-width: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #999;
  }

  .money-input {
    width: 96px;
    padding: 8px 10px;
    background: #222;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .motivo-input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    background: #222;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    font-size: 0.85rem;
  }

  .money-input:focus,
  .motivo-input:focus {
    outline: none;
    border-color: #f59e0b;
  }

  /* Retiradas */
  .retirada-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .remove-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: 1px solid #ef444444;
    border-radius: 8px;
    background: #222;
    color: #ef4444;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .add-btn {
    width: 100%;
    padding: 10px;
    margin-top: 4px;
    border: 1px dashed #333;
    border-radius: 8px;
    background: transparent;
    color: #888;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .add-btn:active {
    background: #1a1a1a;
  }

  .empty-hint {
    margin: 0 0 6px 0;
    font-size: 0.75rem;
    color: #555;
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

  /* Recibo: solo lo que el camarero ha tecleado */
  .recibo {
    margin: 12px 0 8px 0;
    padding: 10px 12px;
    background: #1a1a1a;
    border: 1px solid #222;
    border-radius: 10px;
    text-align: left;
  }

  .recibo-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 0.8rem;
    color: #888;
  }

  .recibo-row strong {
    color: #fff;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .recibo-row.total {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid #333;
    font-weight: 700;
    color: #f59e0b;
  }

  .recibo-row.total strong {
    color: #f59e0b;
  }

  .recibo-motivo {
    color: #666;
    font-size: 0.72rem;
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
