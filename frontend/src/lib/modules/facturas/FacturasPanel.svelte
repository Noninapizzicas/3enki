<script lang="ts">
  /**
   * FacturasPanel — LA SALA DE FACTURAS del jefe (F7, módulo facturas v3.0.0).
   *
   * Dualidad (esquema-jefe): el jefe gestiona las facturas ENTRANTES que llegan
   * SOLAS por chat/telegram (utilización-sistema = factura.entrada) — este panel
   * NO controla la fábrica (factura.entrada/procesar quedan fuera del flujo).
   *
   * Composición (blueprint v2, fase jefe primero):
   *   - CINTA-ESTADO (capa 1-2): "n recibidas · n procesadas · n con error ·
   *     n exportadas" vía facturas.estadisticas (lecturas, R2).
   *   - LISTADO (capa 2): facturas.listar — fila con nombre/proveedor/estado/
   *     fecha/€; el error va NOMBRADO EN SU FILA (chip rojo con code canónico).
   *   - DECLARAR (capa 3, ROL JEFE): los 4 gestos con contrato real
   *     subir{archivo{nombre,contenido}} · actualizar{id,datos} ·
   *     reprocesar{id} · exportar{semana?}. La SEÑAL pareada re-lee (R3).
   *   - Cinta secundaria colapsable "pipeline v2": las 7 etapas del pipeline
   *     (Intake → Convert → Prepare → OCR → Structure(IA) → Validate → Store) +
   *     facturas.pipeline-metrics.
   *
   * Moneda: € float (columnas REAL de sqlite) — NUNCA conversión a céntimos
   * (lección eurosACentimos: los importes viajan tal cual en euros).
   *
   * Patrón del repo: PedidosPanel (mqttRequest + señales dot-notation con
   * debounce, confirmador-nombrado, error en su fila, sin estado asumido).
   */

  import { onMount } from 'svelte';
  import {
    pilaStore,
    cintaStore,
    cintaLoading,
    cintaError,
    pipelineStore,
    mutacionesPendientes,
    errorMutacion,
    ultimoErrorBus,
    loadCinta,
    resetFacturas,
    initFacturasSenales,
    subirFactura,
    actualizarFactura,
    reprocesarFactura,
    exportarFacturas,
    descargarCsv,
    formatearEuros,
    fechaCorta,
    pillEstado,
    errorNombrado,
    ESTADOS_FACTURA,
    STATUS_POR_ESTADO,
    CAMPOS_EUROS,
    ETAPAS_PIPELINE,
    describeError,
    type FacturaRow,
    type FacturaEstado
  } from './stores/facturas';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  /** id de la fila con mutación en vuelo (feedback por fila, no global). */
  let busyId: string | null = null;
  /** errores nombrados EN su fila (error de turno, no modal global). */
  let erroresPorFila: Record<string, string> = {};

  // ---- filtro por estado de la lista (la cinta es el selector natural) ----
  let filtroEstado: FacturaEstado | 'todas' = 'todas';
  $: visibles = filtroEstado === 'todas' ? $pilaStore : $pilaStore.filter((f) => f.estado === filtroEstado);

  // ---- H1 · subir (editor-bloque) ----
  let subiendo = false;
  let subidaAviso: string | null = null;
  let subidaNombre = '';
  let subidaB64 = '';

  // ---- H2 · actualizar (editor-bloque por fila) ----
  let editId: string | null = null;
  let draftText: Record<string, string> = {};
  let draftEstado = '';
  let draftPago = '';
  let guardando = false;

  // ---- H3 · reprocesar (confirmador por fila) ----
  let reprocesarConfId: string | null = null;

  // ---- H4 · exportar (confirmador-nombrado; gesto por fila y por lote) ----
  let exportOpen = false;
  let exportSemana = '';
  let exportBusy = false;
  let exportError: string | null = null;
  let exportAncla: string | null = null; // id de la fila que pidió exportar

  // ---- cinta secundaria: pipeline v2 ----
  let pipelineAbierto = false;

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initFacturasSenales();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetFacturas();
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
      resetFacturas();
    }
  }

  function anotarError(id: string, message: string): void {
    erroresPorFila = { ...erroresPorFila, [id]: message };
  }

  // ==========================================================================
  // H1 — SUBIR: input file local leído como base64 → submit al circuito
  // ==========================================================================

  function fileToB64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('no se pudo leer el archivo'));
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        resolve(dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    subidaAviso = null;
    try {
      subidaB64 = await fileToB64(file);
      subidaNombre = file.name;
    } catch (err) {
      subidaAviso = describeError(err);
    }
  }

  async function ejecutarSubida(): Promise<void> {
    if (!subidaB64) return;
    subiendo = true;
    subidaAviso = null;
    const res = await subirFactura(subidaNombre, subidaB64);
    subiendo = false;
    if (res.success) {
      subidaNombre = '';
      subidaB64 = '';
      subidaAviso = res.duplicate ? 'factura duplicada — ya estaba en el circuito' : null;
    } else {
      subidaAviso = res.error ?? 'no se pudo subir';
    }
    // El tándem factura.recibida → factura.procesada|error re-lee la cinta (R3).
  }

  // ==========================================================================
  // H2 — ACTUALIZAR: editor-bloque con columnas reales (diff vs original)
  // ==========================================================================

  const TEXTOS = ['proveedor_nombre', 'proveedor_nif', 'factura_numero', 'factura_fecha', 'concepto', 'categoria', 'notas'];
  const EUROS = [...CAMPOS_EUROS] as string[];

  const ETIQUETA: Record<string, string> = {
    proveedor_nombre: 'proveedor',
    proveedor_nif: 'NIF',
    factura_numero: 'nº factura',
    factura_fecha: 'fecha factura',
    concepto: 'concepto',
    categoria: 'categoría',
    base_imponible: 'base',
    tipo_iva: 'IVA %',
    cuota_iva: 'cuota',
    total_factura: 'total',
    notas: 'notas'
  };

  function abrirEditor(row: FacturaRow): void {
    editId = row.id;
    draftText = {};
    for (const k of [...TEXTOS, ...EUROS]) {
      const v = row[k];
      draftText[k] = v === null || v === undefined ? '' : String(v);
    }
    draftEstado = row.estado || '';
    draftPago = row.estado_pago || 'pendiente';
  }

  function cerrarEditor(): void {
    editId = null;
    draftText = {};
  }

  async function guardarEdicion(row: FacturaRow): Promise<void> {
    if (!editId) return;
    guardando = true;
    // Diff vs original: solo columnas EDITADAS (el UPDATE del servidor es libre).
    const datos: Record<string, unknown> = {};
    for (const k of TEXTOS) if (draftText[k] !== String(row[k] ?? '')) datos[k] = draftText[k];
    for (const k of EUROS) if (draftText[k] !== String(row[k] ?? '')) datos[k] = draftText[k];
    if (draftEstado && draftEstado !== row.estado) datos.estado = draftEstado;
    if (draftPago && draftPago !== (row.estado_pago ?? '')) datos.estado_pago = draftPago;

    const res = await actualizarFactura(row.id, datos);
    if (res.ok) {
      cerrarEditor();
    } else {
      anotarError(row.id, res.error ?? 'no se pudo actualizar');
    }
    guardando = false;
    // Sin señal propia → el store refresca por dictamen de la respuesta.
  }

  // ==========================================================================
  // H3 — REPROCESAR: relanza el pipeline OCR+IA sobre ESA factura
  // ==========================================================================

  async function ejecutarReproceso(id: string): Promise<void> {
    reprocesarConfId = null;
    busyId = id;
    const res = await reprocesarFactura(id);
    busyId = null;
    if (!res.ok) anotarError(id, res.error ?? 'no se pudo relanzar el pipeline');
    // La señal pareada (procesada | error) re-lee la pila (R3).
  }

  // ==========================================================================
  // H4 — EXPORTAR: CSV de las procesadas + marca exportadas + descarga
  // ==========================================================================

  function abrirExportacion(rowId: string | null): void {
    exportAncla = rowId;
    exportSemana = '';
    exportError = null;
    exportOpen = true;
  }

  async function ejecutarExportacion(): Promise<void> {
    exportBusy = true;
    exportError = null;
    const res = await exportarFacturas(exportSemana.trim() || undefined);
    if (res.ok) {
      if (res.contenidoB64) descargarCsv(res.nombre ?? 'facturas.csv', res.contenidoB64);
      exportOpen = false;
      exportAncla = null;
    } else {
      exportError = res.error ?? 'no se pudo exportar';
    }
    exportBusy = false;
  }

  function hhmm(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="facturas-jefe" data-facturas-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">👔</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">ciclo fiscal · las facturas llegan solas por chat/telegram</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $cintaError}
    <div class="cinta-error">⚠️ {$cintaError}</div>
  {/if}

  <!-- CAPA 1-2 · cinta-estado: el pulso del circuito sin navegar -->
  <div class="cinta-estado">
    <span class="pulso pulso-recibidas">📥 {$cintaStore.pendientes} recibidas</span>
    <span class="pulso pulso-procesando">⚙️ {$cintaStore.procesando ?? 0} procesando</span>
    <span class="pulso pulso-procesadas">✅ {$cintaStore.procesadas} procesadas</span>
    <span class="pulso pulso-error">⚠️ {$cintaStore.errores} con error</span>
    <span class="pulso pulso-exportadas">📤 {$cintaStore.exportadas} exportadas</span>
    {#if $ultimoErrorBus?.code}
      <span class="fila-error-bus" title={$ultimoErrorBus.message ?? ''}>
        último error: {$ultimoErrorBus.file_path ? String($ultimoErrorBus.file_path).split('/').pop() : '—'} · {$ultimoErrorBus.code}
      </span>
    {/if}
    <button
      class="btn-jefe btn-exportar-lote"
      disabled={$cintaStore.procesadas === 0}
      title="marca las procesadas como exportadas y las envía a contabilidad (factura.exportada)"
      on:click={() => abrirExportacion(null)}
    >📤 Exportar a contabilidad</button>
  </div>

  <!-- CAPA 3 · H1 meter al circuito: subir con editor-bloque + input file -->
  <div class="editor-bloque">
    <label class="bloque-titulo" for="facturas-file">➕ Subir factura al circuito</label>
    <div class="bloque-fila">
      <input
        id="facturas-file"
        class="ref-file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        disabled={subiendo}
        on:change={handleFileSelect}
      />
      <button
        class="btn-jefe"
        disabled={subiendo || !subidaB64}
        title="facturas.subir — entra al pipeline OCR+IA (factura.recibida → procesada|error)"
        on:click={ejecutarSubida}
      >{subiendo ? 'procesando…' : `meter al circuito${subidaNombre ? ` · ${subidaNombre}` : ''}`}</button>
    </div>
    {#if subidaAviso}
      <div class="err-tarjeta">{subidaAviso}</div>
    {/if}
    <div class="nota-bloque">las facturas también llegan solas por chat/telegram — esto es solo la boca manual</div>
  </div>

  <!-- CAPA 2 · listado: la pila con gestos por fila -->
  {#if $cintaLoading && $pilaStore.length === 0}
    <div class="gm-loading">cargando facturas…</div>
  {:else if $pilaStore.length === 0}
    <div class="vacio">sin facturas todavía — llegan solas por chat/telegram, o súbelas arriba</div>
  {:else}
    <div class="barra-filtros">
      <select class="filter-select" bind:value={filtroEstado} aria-label="filtrar por estado">
        <option value="todas">todas ({$pilaStore.length})</option>
        {#each ESTADOS_FACTURA as est (est)}
          <option value={est}>{STATUS_POR_ESTADO[est].icono} {STATUS_POR_ESTADO[est].label} ({$pilaStore.filter((f) => f.estado === est).length})</option>
        {/each}
      </select>
    </div>
    <div class="pila">
      {#each visibles as row (row.id)}
        {@const pill = pillEstado(row.estado)}
        {@const err = errorNombrado(row)}
        <article class="tarjeta" class:tarjeta-error={row.estado === 'error'}>
          <header class="tarjeta-cabecera">
            <span class="nombre" title={row.nombre_archivo}>📄 {row.nombre_archivo}</span>
            <span class="money">{formatearEuros(row.total_factura)}</span>
          </header>
          <div class="meta">
            <span class="pill" style="color: {pill.color}; background: {pill.color}1f">{pill.icono} {pill.label}</span>
            {#if row.proveedor_nombre}<span class="meta-item">{row.proveedor_nombre}</span>{/if}
            {#if row.factura_numero}<span class="meta-item">nº {row.factura_numero}</span>{/if}
            <span class="meta-item">📅 {fechaCorta(row.factura_fecha || row.fecha_entrada)}{row.fecha_entrada ? ` · ${hhmm(row.fecha_entrada)}` : ''}</span>
            {#if row.source && row.source !== 'manual'}<span class="meta-item">{row.source === 'telegram' ? '📱 telegram' : '📧 gmail'}</span>{/if}
          </div>
          {#if row.estado === 'error'}
            <div class="chip-error" title={err?.message ?? ''}>
              ⚠️ {err?.code ?? 'ERROR'} — {err?.message ?? 'el pipeline no pudo procesar esta factura'}
            </div>
          {/if}
          {#if erroresPorFila[row.id]}
            <div class="err-tarjeta">{erroresPorFila[row.id]}</div>
          {/if}

          <div class="gestos">
            {#if row.estado === 'error' || row.estado === 'pendiente'}
              <button
                class="btn-jefe"
                disabled={busyId === row.id}
                title="relanza el pipeline OCR+IA sobre esta factura (facturas.reprocesar)"
                on:click={() => (reprocesarConfId = reprocesarConfId === row.id ? null : row.id)}
              >🔄 reprocesar</button>
            {/if}
            <button
              class="btn-jefe"
              disabled={busyId === row.id}
              title="corregir proveedor, estado o importes (facturas.actualizar)"
              on:click={() => (editId === row.id ? cerrarEditor() : abrirEditor(row))}
            >✏️ actualizar</button>
            {#if row.estado === 'procesada'}
              <button
                class="btn-jefe"
                disabled={busyId === row.id}
                title="marca exportadas y las envía a contabilidad (facturas.exportar)"
                on:click={() => abrirExportacion(row.id)}
              >📤 exportar</button>
            {/if}
          </div>

          {#if reprocesarConfId === row.id}
            <div class="confirmador">
              <p>¿relanzar el pipeline <strong>OCR+IA</strong> sobre <strong>{row.nombre_archivo}</strong>? Rehace Intake → Convert → Prepare → OCR → Structure → Validate → Store.</p>
              <div class="confirm-gestos">
                <button class="btn-jefe" disabled={busyId === row.id} on:click={() => ejecutarReproceso(row.id)}>sí, relanzar</button>
                <button class="btn-neutro" on:click={() => (reprocesarConfId = null)}>dejarlo estar</button>
              </div>
            </div>
          {/if}

          {#if editId === row.id}
            <div class="editor-bloque editor-fila">
              <div class="bloque-titulo">corregir datos extraídos</div>
              <div class="editor-grid">
                {#each TEXTOS as campo (campo)}
                  <label class="campo">
                    <span>{ETIQUETA[campo] ?? campo}</span>
                    <input class="ent" type="text" bind:value={draftText[campo]} placeholder={ETIQUETA[campo] ?? campo} />
                  </label>
                {/each}
                {#each EUROS as campo (campo)}
                  <label class="campo">
                    <span>{ETIQUETA[campo] ?? campo} (€)</span>
                    <input class="ent" type="text" inputmode="decimal" bind:value={draftText[campo]} placeholder="0.00" />
                  </label>
                {/each}
                <label class="campo">
                  <span>estado</span>
                  <select class="ent" bind:value={draftEstado}>
                    {#each ESTADOS_FACTURA as est (est)}
                      <option value={est}>{STATUS_POR_ESTADO[est].label}</option>
                    {/each}
                  </select>
                </label>
                <label class="campo">
                  <span>estado pago</span>
                  <select class="ent" bind:value={draftPago}>
                    <option value="pendiente">pendiente</option>
                    <option value="pagada">pagada</option>
                  </select>
                </label>
              </div>
              <div class="confirm-gestos">
                <button class="btn-jefe" disabled={guardando} on:click={() => guardarEdicion(row)}>guardar corrección</button>
                <button class="btn-neutro" on:click={cerrarEditor}>dejarlo estar</button>
              </div>
            </div>
          {/if}

          {#if exportOpen && exportAncla === row.id}
            <div class="confirmador">
              <p>¿marcar <strong>{row.nombre_archivo}</strong> y TODAS las procesadas como <strong>exportadas</strong> y enviarlas a contabilidad? Genera el CSV del lote — no se deshace.</p>
              <input class="ent ancho" type="text" placeholder="semana ISO (ej. 2026-W35) — vacío = actual" bind:value={exportSemana} />
              {#if exportError}<div class="err-tarjeta">⚠️ {exportError}</div>{/if}
              <div class="confirm-gestos">
                <button class="btn-rojo" disabled={exportBusy} on:click={ejecutarExportacion}>{exportBusy ? 'exportando…' : 'exportar a contabilidad'}</button>
                <button class="btn-neutro" on:click={() => (exportOpen = false)}>dejarlo estar</button>
              </div>
            </div>
          {/if}
        </article>
      {:else}
        <div class="vacio">ninguna factura con ese estado</div>
      {/each}
    </div>
  {/if}

  {#if exportOpen && !exportAncla}
    <div class="confirmador lote">
      <p>¿exportar las <strong>{$cintaStore.procesadas}</strong> facturas <strong>procesadas</strong> a contabilidad? Las marca exportadas y descarga el CSV — no se deshace.</p>
      <input class="ent ancho" type="text" placeholder="semana ISO (ej. 2026-W35) — vacío = actual" bind:value={exportSemana} />
      {#if exportError}<div class="err-tarjeta">⚠️ {exportError}</div>{/if}
      <div class="confirm-gestos">
        <button class="btn-rojo" disabled={exportBusy || $cintaStore.procesadas === 0} on:click={ejecutarExportacion}>
          {exportBusy ? 'exportando…' : `exportar ${$cintaStore.procesadas} procesadas`}
        </button>
        <button class="btn-neutro" on:click={() => (exportOpen = false)}>dejarlo estar</button>
      </div>
    </div>
  {/if}

  <!-- Cinta secundaria · pipeline v2 colapsable -->
  <div class="pipeline-bloque">
    <button class="pipeline-toggle" aria-expanded={pipelineAbierto} on:click={() => (pipelineAbierto = !pipelineAbierto)}>
      {pipelineAbierto ? '▾' : '▸'} pipeline v2
      {#if $pipelineStore?.summary}
        <span class="pipeline-resumen">{$pipelineStore.summary.successRate}% ok · {$pipelineStore.summary.total} en el pipeline</span>
      {/if}
    </button>
    {#if pipelineAbierto}
      <div class="etapas">
        {#each ETAPAS_PIPELINE as etapa, i (etapa.id)}
          <div class="etapa" class:etapa-ia={etapa.ia}>
            <span class="etapa-num">{i + 1}</span>
            <span class="etapa-label">{etapa.label}</span>
            {#if i < ETAPAS_PIPELINE.length - 1}<span class="etapa-flecha">→</span>{/if}
          </div>
        {/each}
      </div>
      {#if $pipelineStore}
        <div class="pipeline-metrics">
          <span>📐 {$pipelineStore.summary?.total ?? 0} procesadas por el pipeline</span>
          <span>✅ {$pipelineStore.summary?.success ?? 0} ok</span>
          <span>⚠️ {$pipelineStore.summary?.failed ?? 0} fallos</span>
          <span>♻️ {$pipelineStore.summary?.duplicates ?? 0} duplicados</span>
          <span>💰 {$pipelineStore.cost?.totalEur ?? '0'} €</span>
          <span>🔤 {Intl.NumberFormat('es-ES').format($pipelineStore.cost?.totalTokens ?? 0)} tokens</span>
          <button class="btn-neutro" title="releer métricas del pipeline" on:click={() => { const pid = $sessionProjectId; if (pid) void loadCinta(pid); }}>releer</button>
        </div>
      {:else}
        <div class="nota-bloque">métricas del pipeline no disponibles ahora mismo</div>
      {/if}
    {/if}
  </div>

  {#if $errorMutacion}
    <div class="err-pie">{$errorMutacion}</div>
  {/if}
</div>

<style>
  .facturas-jefe {
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
  .badge-sync { margin-left: auto; color: var(--color-primary, #eab308); font-size: 0.65rem; }

  .cinta-error {
    padding: 0.4rem 0.7rem;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .cinta-estado {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
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
  .pulso-recibidas { color: #9ca3af; background: rgba(156, 163, 175, 0.12); }
  .pulso-procesando { color: #f59e0b; background: rgba(245, 158, 11, 0.12); }
  .pulso-procesadas { color: #60a5fa; background: rgba(96, 165, 250, 0.12); }
  .pulso-error { color: #ef4444; background: rgba(239, 68, 68, 0.12); }
  .pulso-exportadas { color: #22c55e; background: rgba(34, 197, 94, 0.12); }
  .fila-error-bus {
    font-size: 0.65rem;
    color: #f87171;
    padding: 0.1rem 0.45rem;
    border: 1px dashed rgba(239, 68, 68, 0.5);
    border-radius: 999px;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn-exportar-lote { margin-left: auto; }

  .editor-bloque {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.55rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .bloque-titulo { font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted, #aaa); }
  .bloque-fila { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .nota-bloque { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .ref-file { font-size: 0.75rem; color: inherit; max-width: 22rem; }

  .filter-select, .ent, .ancho {
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    font-size: 0.75rem;
  }
  .barra-filtros { display: flex; gap: 0.5rem; align-items: center; }

  .pila {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tarjeta {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .tarjeta-error { border-color: rgba(239, 68, 68, 0.45); }
  .tarjeta-cabecera {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: baseline;
  }
  .nombre {
    font-weight: 600;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .money { font-weight: 700; font-variant-numeric: tabular-nums; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.7rem;
    color: var(--color-text-muted, #999);
  }
  .pill {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.08rem 0.45rem;
    border-radius: 999px;
  }
  .chip-error {
    font-size: 0.65rem;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
  }
  .gestos { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  .btn-jefe {
    padding: 0.3rem 0.7rem;
    background: var(--color-surface-2, #242424);
    color: inherit;
    border: 1px solid var(--color-border, #444);
    border-radius: 6px;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .btn-jefe:hover:not(:disabled) { border-color: var(--color-primary, #eab308); }
  .btn-jefe:disabled { opacity: 0.45; cursor: default; }
  .btn-rojo {
    padding: 0.3rem 0.7rem;
    background: rgba(239, 68, 68, 0.16);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 6px;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .btn-neutro {
    padding: 0.3rem 0.7rem;
    background: transparent;
    color: var(--color-text-muted, #999);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .confirmador {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid rgba(234, 179, 8, 0.4);
    background: rgba(234, 179, 8, 0.06);
    border-radius: 8px;
    font-size: 0.72rem;
  }
  .confirmador.lote { margin-bottom: 0.2rem; }
  .confirm-gestos { display: flex; gap: 0.4rem; flex-wrap: wrap; }

  .editor-fila { border-color: rgba(96, 165, 250, 0.35); }
  .editor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.4rem;
  }
  .campo { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.62rem; color: var(--color-text-muted, #999); }
  .ent { width: 100%; }

  .pipeline-bloque {
    border: 1px dashed var(--color-border, #333);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.72rem;
  }
  .pipeline-toggle {
    background: none;
    border: none;
    color: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.1rem 0;
  }
  .pipeline-resumen { font-weight: 400; color: var(--color-text-muted, #999); }
  .etapas { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.45rem 0; }
  .etapa {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--color-border, #333);
    color: var(--color-text-muted, #bbb);
  }
  .etapa-ia { border-color: rgba(167, 139, 250, 0.6); color: #c4b5fd; }
  .etapa-num { font-size: 0.6rem; opacity: 0.7; }
  .etapa-flecha { color: var(--color-text-muted, #666); }
  .pipeline-metrics { display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: center; color: var(--color-text-muted, #bbb); }
  .pipeline-metrics .btn-neutro { margin-left: auto; }

  .gm-loading { padding: 1.2rem; text-align: center; color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .vacio { padding: 0.8rem; text-align: center; color: var(--color-text-muted, #777); font-size: 0.75rem; }
  .err-tarjeta {
    font-size: 0.68rem;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
  }
  .err-pie { font-size: 0.7rem; color: #ef4444; }
</style>