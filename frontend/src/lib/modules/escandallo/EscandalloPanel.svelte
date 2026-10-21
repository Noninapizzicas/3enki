<script lang="ts">
  /**
   * EscandalloPanel — la cara del JEFE del costeo (F7, módulo escandallo
   * reflejo-1.4.0, según esquema-jefe/ del commit 1). Módulo ATÍPICO: el jefe
   * NO escribe reglas — LEE el dictamen del motor (INV1) y DISPARA costeos.
   *
   * Composición (3 capas):
   *   - CINTA-ESTADO: "n recetas · n escandalizadas · coste medio" — SOLO de
   *     lecturas (recetas.listar {incluir_lineas}, R2). Nunca asumido.
   *   - REF-SELECT receta → TABLA-CÁLCULO: ingrediente × cantidad = coste de
   *     línea, con FUENTE del precio (catalogo | sub_receta) y peso % por fila
   *     (única cuenta permitida en UI: % de presentación — INV1). Sin margen
   *     ([ABIERTO]).
   *   - GESTOS de regeneración (D1): [recalcular siguiente] (el motor responde
   *     con costeada+faltan: gesto repetible), [recalcular LOTE]
   *     (confirmador-nombrado: N señales en tándem absorbidas por debounce) y
   *     [costear ESTA] (confirmador, persiste la receta activa). La SEÑAL
   *     pareada `escandallo.coste.calculado` re-lee (R3) — también la que
   *     llega de costeos externos (otra ventana/agente).
   *
   * Honestidad (INV7): las líneas sin precio en catálogo van SIN número y
   * nombradas en su fila — retar el precio toca en `ingredientes`, no aquí.
   *
   * Moneda (INV2): € (es-ES) — coste_total 2dec, coste_unidad hasta 6dec por
   * sub-recetas. El escalado NO vive en este panel: es derivación transitoria
   * sin señal, fuera del flujo del dictamen (INV5).
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    cinta,
    cintaLoading,
    cintaError,
    recetas,
    recetaDetalle,
    tablaEscandallo,
    gestosPendientes,
    errorMutacion,
    resultadoSiguiente,
    loadResumen,
    elegirReceta,
    costearReceta,
    recalcularSiguiente,
    recalcularLote,
    initEscandalloSubscriptions,
    resetEscandallo,
    formatearEuros,
    formatearPrecioUnitario
  } from './stores/escandallo';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /** Receta elegida en el ref-select. */
  let seleccion = '';
  /** Confirmadores-nombrados (gestos que persisten: piden un "sí, …" explícito). */
  let costearOpen = false;
  let loteOpen = false;
  /** Aviso del último gesto de regeneración (costeada X · faltan N / lote). */
  let aviso: string | null = null;

  let cleanup: (() => void) | null = null;

  $: filas = $tablaEscandallo;
  $: detalle = $recetaDetalle;
  /** Nombre mostrado de la receta activa (la ficha de obtener no siempre trae id). */
  $: detalleNombre = detalle?.nombre ?? ordenadas.find((r) => r.receta_id === seleccion)?.nombre ?? '';

  // Mismo orden que el motor (ORDEN_TIPO): masa/salsa/base → pizza; alfabético dentro.
  const ORDEN_TIPO: Record<string, number> = { masa: 0, salsa: 0, base: 0, pizza: 1 };
  $: ordenadas = [...$recetas].sort((a, b) => {
    const ta = a.tipo != null && ORDEN_TIPO[a.tipo] != null ? ORDEN_TIPO[a.tipo] : 1;
    const tb = b.tipo != null && ORDEN_TIPO[b.tipo] != null ? ORDEN_TIPO[b.tipo] : 1;
    return ta !== tb ? ta - tb : a.nombre.localeCompare(b.nombre);
  });

  onMount(() => {
    cleanup = initEscandalloSubscriptions();
    void loadResumen();
  });
  onDestroy(() => {
    cleanup?.();
    resetEscandallo();
  });

  function onElegir(): void {
    loteOpen = false;
    costearOpen = false;
    aviso = null;
    void elegirReceta(seleccion || null);
  }

  // ---- [recalcular siguiente] — gesto repetible: el motor responde «vuelve a llamar» ----
  async function onSiguiente(): Promise<void> {
    aviso = null;
    const r = await recalcularSiguiente();
    if (!r) return;
    if (r.costeada) {
      aviso = r.terminado
        ? `completo: costeada «${r.costeada.nombre}» — no quedan pendientes`
        : `costeada «${r.costeada.nombre}» · faltan ${r.faltan} — vuelve a pedir «recalcular siguiente»`;
    } else if (r.terminado) {
      aviso = 'completo: no quedan recetas pendientes de costear';
    }
  }

  // ---- [recalcular LOTE] — confirmador-nombrado: persiste TODAS las pendientes ----
  async function ejecutarLote(): Promise<void> {
    loteOpen = false;
    aviso = null;
    const r = await recalcularLote();
    if (!r) return;
    if (r.total_costeadas === 0) {
      aviso = 'nada pendiente: todas las recetas ya tienen su coste';
      return;
    }
    const sin = r.sin_precio ?? [];
    aviso =
      `lote: ${r.total_costeadas} receta(s) costeada(s)` +
      (sin.length > 0 ? ` · sin precio: ${sin.slice(0, 6).join(', ')}${sin.length > 6 ? '…' : ''}` : '');
  }

  // ---- [costear ESTA] — confirmador de LA receta activa (persiste su dictamen) ----
  async function ejecutarCostear(): Promise<void> {
    costearOpen = false;
    if (!seleccion) return;
    aviso = null;
    try {
      await costearReceta(seleccion);
      // la señal pareada re-lee (R3): el dictamen nuevo llega solo
    } catch {
      /* el error ya vive en $errorMutacion (describeError del store) */
    }
  }
</script>

<div class="escandallo-panel" data-panel-id={panelId}>
  <!-- CAPA 1 · CINTA-ESTADO (solo lecturas — R2) -->
  <div class="cinta">
    <div class="cinta-datos">
      <span class="dato"><strong>{$cinta.recetas}</strong> recetas</span>
      <span class="sep">·</span>
      <span class="dato"><strong>{$cinta.escandalizadas}</strong> escandalizadas</span>
      <span class="sep">·</span>
      <span class="dato">coste medio <strong>{formatearEuros($cinta.costeMedio)}</strong></span>
    </div>
    {#if $cintaLoading}
      <span class="cinta-estado">leyendo recetas…</span>
    {:else if $gestosPendientes > 0}
      <span class="cinta-estado">costeando…</span>
    {/if}
  </div>

  {#if $cintaError}
    <div class="error"><span>⚠️ la cinta no leyó: {$cintaError}</span></div>
  {/if}
  {#if $errorMutacion}
    <div class="error">
      <span>⚠️ {$errorMutacion}</span>
      <button class="cerrar" on:click={() => errorMutacion.set(null)}>×</button>
    </div>
  {/if}

  <!-- REF-SELECT receta (capa SELECCIONAR) -->
  <label class="selector">
    <span>receta a escandalizar</span>
    <select bind:value={seleccion} on:change={onElegir} disabled={ordenadas.length === 0}>
      <option value="">— elige una receta —</option>
      {#each ordenadas as r (r.receta_id)}
        <option value={r.receta_id}>
          {r.nombre}{typeof r.coste_unidad === 'number' && r.coste_unidad > 0 ? ` — ${formatearEuros(r.coste_unidad, 4)}/ud` : ' · sin coste'}
        </option>
      {/each}
    </select>
  </label>

  <!-- GESTOS [recalcular siguiente][recalcular LOTE·confirmador][costear·confirmador] -->
  <div class="gestos">
    <button class="btn-jefe" on:click={onSiguiente} disabled={$gestosPendientes > 0}>
      ↻ recalcular siguiente
    </button>
    {#if loteOpen}
      <div class="confirmador">
        <p>¿costear <strong>TODAS</strong> las recetas pendientes en un lote? El motor persiste cada una y la señal late una vez por receta (absorbida en una re-lectura). Lo que no tenga precio queda honesto en su fila.</p>
        <div class="confirm-gestos">
          <button class="btn-rojo" disabled={$gestosPendientes > 0} on:click={ejecutarLote}>sí, recalcular lote</button>
          <button class="btn-neutro" on:click={() => (loteOpen = false)}>dejarlo estar</button>
        </div>
      </div>
    {:else}
      <button class="btn-lote" on:click={() => { loteOpen = true; costearOpen = false; }} disabled={$gestosPendientes > 0 || ordenadas.length === 0}>
        recalcular LOTE
      </button>
    {/if}
    {#if costearOpen && detalle}
      <div class="confirmador">
        <p>¿recalcular el coste de <strong>{detalleNombre}</strong> y GUARDARLO en la receta? 1 dictamen → 1 señal.</p>
        <div class="confirm-gestos">
          <button class="btn-jefe" disabled={$gestosPendientes > 0} on:click={ejecutarCostear}>sí, costear ya</button>
          <button class="btn-neutro" on:click={() => (costearOpen = false)}>dejarlo estar</button>
        </div>
      </div>
    {/if}
    {#if seleccion && !costearOpen && !loteOpen}
      <button class="btn-lote costear" on:click={() => { costearOpen = true; loteOpen = false; }} disabled={$gestosPendientes > 0}>
        costear ESTA
      </button>
    {/if}
  </div>

  {#if aviso}
    <div class="aviso">
      <span>✓ {aviso}</span>
      {#if $resultadoSiguiente?.siguiente && !$resultadoSiguiente.terminado}
        <span class="aviso-detalle">{$resultadoSiguiente.siguiente}</span>
      {/if}
    </div>
  {/if}

  <!-- TABLA-CÁLCULO (capa INFORMARSE) -->
  {#if detalle}
    <div class="ficha">
      <div class="ficha-cab">
        <h3>{detalleNombre}</h3>
        <div class="badges">
          {#if detalle.tipo}<span class="badge">{detalle.tipo}</span>{/if}
          {#if detalle.rinde?.cantidad}<span class="badge">rinde {detalle.rinde.cantidad} {detalle.rinde?.unidad}</span>{/if}
        </div>
      </div>

      {#if !filas || filas.length === 0}
        <div class="vacio">
          receta sin líneas todavía — las líneas viven en <strong>recetas</strong>: sin línea no hay coste
        </div>
      {:else}
        <div class="totales">
          <span class="kpi highlight"><small>coste total</small><strong>{formatearEuros(detalle.coste_total)}</strong></span>
          <span class="kpi"><small>coste / unidad</small><strong>{formatearEuros(detalle.coste_unidad, 6)}</strong></span>
          <span class="kpi"><small>fuentes</small><span class="fuentes">{(detalle.fuentes_precios ?? []).join(' · ') || '—'}</span></span>
        </div>

        <table class="tabla">
          <thead>
            <tr>
              <th>ingrediente</th>
              <th class="num">×cantidad</th>
              <th class="num">= coste línea</th>
              <th>fuente</th>
              <th class="num">peso %</th>
            </tr>
          </thead>
          <tbody>
            {#each filas as f (f.ref)}
              <tr class:fila-sin-precio={f.sinPrecio}>
                <td class="nombre">
                  {f.nombre}
                  {#if f.sinPrecio}<span class="chip-sin">sin precio</span>{/if}
                </td>
                <td class="num">{f.cantidad} {f.unidad}</td>
                <td class="num precio">
                  {#if f.sinPrecio}
                    —
                  {:else}
                    {formatearEuros(f.valor)}
                    <span class="unitario">({formatearPrecioUnitario(f.precioUnitario, f.unidad)})</span>
                  {/if}
                </td>
                <td>{#if !f.sinPrecio}<span class="chip-fuente">{f.fuente}</span>{:else}—{/if}</td>
                <td class="num celda-peso">
                  {#if f.pesoPct != null}
                    <span class="barrita" style="width: {Math.max(f.pesoPct, 2)}px"></span>
                    {f.pesoPct}%
                  {:else}
                    —
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if (detalle.lineas_sin_precio?.length ?? 0) > 0}
          <p class="aviso-honesto">
            sin precio en catálogo: {detalle.lineas_sin_precio!.join(', ')} — el coste es parcial; se retan en <strong>ingredientes</strong>, no aquí
          </p>
        {/if}
      {/if}
    </div>
  {:else if $cinta.recetas > $cinta.escandalizadas}
    <div class="pista">
      {$cinta.recetas - $cinta.escandalizadas} receta(s) con líneas aún sin coste — «recalcular siguiente» cuesta 1 dictamen; «LOTE» regenera todas de una vez
    </div>
  {:else if ordenadas.length === 0 && !$cintaLoading && !$cintaError}
    <div class="vacio">no hay recetas en servicio — crea recetas (sección Recetas) para escandalizarlas</div>
  {/if}

  {#if detalle && detalle.coste_actualizado_at}
    <div class="pista dim">dictamen del {new Date(detalle.coste_actualizado_at).toLocaleString('es-ES')}</div>
  {/if}
</div>

<style>
  .escandallo-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }

  /* ---- capa 1 · cinta ---- */
  .cinta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color, #333);
    flex-shrink: 0;
    font-size: 12px;
  }
  .cinta strong { color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .sep { color: var(--text-tertiary, rgba(113, 113, 122, 1)); }
  .cinta-estado { margin-left: auto; font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
  }
  .error .cerrar { background: none; border: none; color: inherit; cursor: pointer; font-size: 15px; }

  /* ---- ref-select ---- */
  .selector {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 12px 8px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .selector select {
    padding: 7px 9px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    font-size: 13px;
  }
  .selector select:focus { outline: none; border-color: var(--accent-color, rgba(96, 165, 250, 1)); }

  /* ---- gestos + confirmadores ---- */
  .gestos { display: flex; gap: 8px; align-items: flex-start; padding: 0 12px 10px; flex-wrap: wrap; }
  .gestos .confirmador { flex: 1 1 100%; margin: 0; }
  button { cursor: pointer; font-size: 12px; border-radius: 6px; transition: all 0.15s; }
  button:disabled { opacity: 0.45; cursor: default; }
  .btn-jefe {
    padding: 6px 12px;
    background: rgba(96, 165, 250, 0.15);
    border: 1px solid rgba(96, 165, 250, 0.4);
    color: var(--accent-color, rgba(96, 165, 250, 1));
  }
  .btn-jefe:hover:not(:disabled) { background: rgba(96, 165, 250, 0.25); }
  .btn-lote {
    padding: 6px 12px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: rgba(245, 158, 11, 1);
  }
  .btn-lote:hover:not(:disabled) { background: rgba(245, 158, 11, 0.22); }
  .btn-lote.costear { background: none; border-color: rgba(245, 158, 11, 0.25); color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .btn-rojo {
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: rgba(248, 113, 113, 1);
  }
  .btn-neutro {
    padding: 6px 12px;
    background: none;
    border: 1px solid var(--border-color, #333);
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .btn-neutro:hover { color: var(--text-primary, rgba(228, 228, 231, 1)); }

  .confirmador {
    flex: 1 1 100%;
    padding: 10px 12px;
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 8px;
    font-size: 12px;
  }
  .confirmador p { margin: 0 0 8px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .confirm-gestos { display: flex; gap: 8px; }

  .aviso {
    margin: 0 12px 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.08);
    color: rgba(74, 222, 128, 1);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .aviso-detalle { font-size: 11px; opacity: 0.8; }

  /* ---- tabla-cálculo ---- */
  .ficha { padding: 0 12px 16px; }
  .ficha-cab { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; flex-wrap: wrap; }
  .ficha-cab h3 { margin: 0; font-size: 15px; }
  .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); }

  .totales { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .kpi {
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    min-width: 80px;
  }
  .kpi small { font-size: 10px; color: var(--text-secondary, rgba(161, 161, 170, 1)); margin-bottom: 2px; }
  .kpi strong { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .kpi.highlight { background: rgba(96, 165, 250, 0.08); border-color: rgba(96, 165, 250, 0.3); }
  .kpi .fuentes { font-size: 11px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  .tabla { width: 100%; border-collapse: collapse; font-size: 12px; }
  .tabla th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-tertiary, rgba(113, 113, 122, 1));
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-color, #333);
  }
  .tabla th.num { text-align: right; }
  .tabla td { padding: 6px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: top; }
  .tabla td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tabla td.nombre { font-weight: 600; }
  .tabla td.precio { font-weight: 600; color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .tabla .unitario { font-weight: 400; font-size: 10px; color: var(--text-tertiary, rgba(113, 113, 122, 1)); margin-left: 4px; }
  .tabla td.celda-peso { color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .tabla .barrita {
    display: inline-block;
    height: 3px;
    border-radius: 2px;
    background: rgba(96, 165, 250, 0.5);
    margin-right: 6px;
    vertical-align: middle;
  }

  .chip-sin {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(250, 179, 135, 0.15);
    color: rgba(250, 179, 135, 1);
    margin-left: 6px;
    font-weight: 600;
  }
  .chip-fuente {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  tr.fila-sin-precio td.precio,
  tr.fila-sin-precio td:nth-child(4) { vertical-align: middle; }

  .aviso-honesto {
    margin-top: 10px;
    font-size: 11px;
    color: rgba(250, 179, 135, 1);
    background: rgba(250, 179, 135, 0.06);
    border: 1px solid rgba(250, 179, 135, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
  }

  .pista { padding: 4px 12px 12px; font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .vacio { padding: 28px 16px; text-align: center; font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
</style>