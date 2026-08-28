<script lang="ts">
  /**
   * BlueprintForm — panel DINÁMICO de 4 zonas derivado de un blueprint de módulo (patrón Windmill
   * aplicado a Enki: un solo componente sirve para todos los módulos; el blueprint alimenta las zonas).
   *
   *   1. FORMULARIO   — operaciones con args → campos (string→input, number→number, enum→select,
   *                     bool→checkbox, json→textarea, kv→clave/valor)
   *   2. ACCIONES     — operaciones sin args → botones directos
   *   3. ESTADOS VIVOS— eventos_que_escucho + transporte.salida → indicadores en vivo (MQTT)
   *   4. DATOS        — ui.datos { op, refresh_on } → tabla/list del storage vía RPC
   *   5. CUSTOM       — <slot name="custom" /> para lo que el dinámico no cubre (se omite si vacío)
   *
   * Contrato de transporte (idéntico al resto del frontend):
   *   - RPCs: mqttRequest(moduleId, action, { project_id, ...args }) → ui/request/{dominio}/{accion}
   *   - Vivo: subscribe(evento, ...) — dot notation → core/+/events/{dominio}/{evento} (envelope)
   */
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';
  import { subscribe } from '$lib/ui-core/mqtt';
  import { activeProjectId } from '$lib/stores/projects';
  import { deriveZones, labelize, humanize, type BlueprintArg, type BlueprintOp, type BlueprintEventoVivo, type BlueprintDatos, type BlueprintDetalle } from './blueprint-zones';
  import RefSelect from './RefSelect.svelte';
  import ResultView from './ResultView.svelte';

  export let blueprint: Record<string, unknown> | null = null;
  export let moduleId = '';
  export let projectIdOverride: string | null = null;
  export let titulo = '';

  $: zones = deriveZones(blueprint);

  // Estado del formulario: formValues[op][campo]
  let formValues: Record<string, Record<string, unknown>> = {};
  // Resultado por operación
  let resultados: Record<string, { ok: boolean; msg: string; data?: unknown }> = {};
  let busy: string | null = null;
  let error = '';

  // ESTADOS VIVOS: por evento → contador + último payload + timestamp
  let vivos: Record<string, { count: number; ultimo: string; ts: string }> = {};
  $: vivoList = Object.entries(vivos).map(([evento, s]) => ({ evento, ...s }));

  // DATOS
  let datosFilas: Record<string, unknown>[] = [];
  let datosCols: string[] = [];
  let datosTitulo = '';
  let datosCargando = false;
  let datosNeedsArgs = false;
  let datosHint = '';

  // DETALLE: vista drill-down de una entidad
  let detalleData: Record<string, unknown> | null = null;
  let detalleCargando = false;
  let detalleId: string | null = null;

  function getProjectId(): string | null {
    if (projectIdOverride) return projectIdOverride;
    const pid = get(activeProjectId);
    return pid || null;
  }

  function errMsg(e: unknown): string {
    if (e instanceof MqttTimeoutError) return `Timeout: ${moduleId} no respondió`;
    if (e instanceof MqttRequestError) return e.message || 'Error del módulo';
    if (e instanceof Error) return e.message;
    return String(e);
  }

  function fieldValue(op: string, arg: BlueprintArg): unknown {
    return formValues[op]?.[arg.nombre];
  }
  function setField(op: string, arg: BlueprintArg, v: unknown) {
    formValues = { ...formValues, [op]: { ...(formValues[op] || {}), [arg.nombre]: v } };
  }
  // kv: almacena { clave, valor }
  function kvPart(op: string, arg: BlueprintArg, parte: 'clave' | 'valor'): string {
    const v = (formValues[op]?.[arg.nombre] as { clave?: string; valor?: string }) || {};
    return v[parte] || '';
  }
  function setKvPart(op: string, arg: BlueprintArg, parte: 'clave' | 'valor', v: string) {
    const prev = (formValues[op]?.[arg.nombre] as { clave?: string; valor?: string }) || {};
    setField(op, arg, { ...prev, [parte]: v });
  }

  function buildPayload(op: BlueprintOp): { payload: Record<string, unknown>; error: string | null } {
    const payload: Record<string, unknown> = {};
    for (const arg of op.args) {
      const v = formValues[op.nombre]?.[arg.nombre];
      if (arg.tipo === 'kv') {
        const kv = (v as { clave?: string; valor?: string }) || {};
        const clave = arg.kvClave ?? kv.clave;
        const valor = kv.valor;
        if (arg.required && (!clave || valor === undefined || valor === '')) {
          return { payload, error: `Falta el par ${arg.nombre} (clave y valor)` };
        }
        if (clave && valor !== undefined && valor !== '') payload[arg.nombre] = { [clave]: valor };
        continue;
      }
      if (arg.tipo === 'json') {
        if (v === undefined || v === '') {
          if (arg.required) return { payload, error: `Falta ${arg.nombre}` };
          continue;
        }
        try {
          payload[arg.nombre] = JSON.parse(String(v));
        } catch {
          return { payload, error: `${arg.nombre} no es JSON válido` };
        }
        continue;
      }
      if (v === undefined || v === '' || v === false) {
        if (arg.required && v === undefined) return { payload, error: `Falta ${arg.nombre}` };
        if (v !== false && v !== undefined && v !== '') payload[arg.nombre] = v;
        continue;
      }
      if (arg.tipo === 'number') {
        const n = Number(v);
        payload[arg.nombre] = Number.isFinite(n) ? n : v;
      } else {
        payload[arg.nombre] = v;
      }
    }
    return { payload, error: null };
  }

  async function runOp(op: BlueprintOp) {
    const pid = getProjectId();
    if (!pid) { error = 'Selecciona un proyecto para operar.'; return; }
    const { payload, error: buildErr } = buildPayload(op);
    if (buildErr) { error = buildErr; return; }
    busy = op.nombre;
    error = '';
    try {
      const res = await mqttRequest(op.dominio || moduleId, op.nombre, { project_id: pid, ...payload });
      resultados = { ...resultados, [op.nombre]: { ok: true, msg: `ok (${res.status})`, data: res.data } };
      if (zones.datos && op.nombre === zones.datos.op && res.data) {
        populateDatos(res.data);
      }
    } catch (e) {
      resultados = { ...resultados, [op.nombre]: { ok: false, msg: errMsg(e) } };
    } finally {
      busy = null;
    }
  }

  function primerArray(d: unknown): Record<string, unknown>[] | null {
    if (Array.isArray(d)) return d as Record<string, unknown>[];
    if (d && typeof d === 'object') {
      for (const v of Object.values(d as Record<string, unknown>)) {
        if (Array.isArray(v)) return v as Record<string, unknown>[];
      }
    }
    return null;
  }

  async function loadDatos() {
    if (!zones.datos) return;
    const pid = getProjectId();
    if (!pid) return;
    const d: BlueprintDatos = zones.datos;
    datosCargando = true;
    datosTitulo = d.titulo;
    error = '';
    try {
      const allOps = [...zones.formulario, ...zones.acciones];
      const datosOp = allOps.find(o => o.nombre === d.op);
      const domain = datosOp?.dominio || moduleId;
      const res = await mqttRequest(domain, d.op, { project_id: pid });
      const arr = primerArray(res.data);
      if (arr) {
        datosFilas = arr;
        const cols = d.columnas && d.columnas.length
          ? d.columnas
          : (arr.length ? Object.keys(arr[0]).slice(0, 8) : []);
        datosCols = cols;
      } else {
        datosFilas = res.data && typeof res.data === 'object' ? [res.data as Record<string, unknown>] : [];
        datosCols = d.columnas || Object.keys((res.data as Record<string, unknown>) || {}).slice(0, 8);
      }
    } catch (e) {
      error = `datos (${d.op}): ${errMsg(e)}`;
      datosFilas = [];
      datosCols = [];
    } finally {
      datosCargando = false;
    }
  }

  function populateDatos(data: unknown) {
    const d = zones.datos;
    if (!d) return;
    const arr = primerArray(data);
    if (arr) {
      datosFilas = arr;
      datosCols = d.columnas && d.columnas.length
        ? d.columnas
        : (arr.length ? Object.keys(arr[0]).slice(0, 8) : []);
    } else if (data && typeof data === 'object') {
      datosFilas = [data as Record<string, unknown>];
      datosCols = d.columnas || Object.keys(data as Record<string, unknown>).slice(0, 8);
    }
    datosTitulo = d.titulo;
    datosHint = '';
  }

  async function loadDetalle(id: string) {
    if (!zones.detalle) return;
    const pid = getProjectId();
    if (!pid) return;
    detalleId = id;
    detalleCargando = true;
    error = '';
    try {
      const allOps = [...zones.formulario, ...zones.acciones];
      const detalleOp = allOps.find(o => o.nombre === zones.detalle!.op);
      const domain = detalleOp?.dominio || moduleId;
      const res = await mqttRequest(domain, zones.detalle.op, { project_id: pid, id });
      detalleData = (res.data && typeof res.data === 'object') ? res.data as Record<string, unknown> : null;
    } catch (e) {
      error = `detalle: ${errMsg(e)}`;
      detalleData = null;
    } finally {
      detalleCargando = false;
    }
  }

  function closeDetalle() {
    detalleData = null;
    detalleId = null;
  }

  async function runDetalleAction(actionName: string) {
    if (!detalleId) return;
    const pid = getProjectId();
    if (!pid) return;
    const allOps = [...zones.formulario, ...zones.acciones];
    const op = allOps.find(o => o.nombre === actionName);
    if (!op) return;
    busy = actionName;
    error = '';
    try {
      const payload: Record<string, unknown> = { project_id: pid };
      const idField = op.args.find(a => a.nombre === 'id' || a.nombre === 'pedido_id' || a.nombre.endsWith('_id'));
      if (idField) payload[idField.nombre] = detalleId;
      const res = await mqttRequest(op.dominio || moduleId, actionName, payload);
      resultados = { ...resultados, [actionName]: { ok: true, msg: `ok (${res.status})`, data: res.data } };
      if (detalleId) loadDetalle(detalleId);
      if (zones.datos) loadDatos();
    } catch (e) {
      resultados = { ...resultados, [actionName]: { ok: false, msg: errMsg(e) } };
    } finally {
      busy = null;
    }
  }

  function detalleEstadoActual(): string {
    if (!detalleData) return '';
    return String(detalleData['estado'] || detalleData['status'] || '');
  }

  function celda(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
    return String(v);
  }

  let cleanup: Array<() => void> = [];
  let inicializado = false;

  $: if (zones && !inicializado) {
    // la derivación depende del blueprint prop; al cambiar, re-inicializar
    inicializado = true;
  }

  onMount(() => {
    for (const ev of zones.estadosVivos) {
      const unsub = subscribe(ev.evento, (payload: unknown) => {
        const prev = vivos[ev.evento] || { count: 0, ultimo: '', ts: '' };
        let txt = '';
        try { txt = JSON.stringify(payload); } catch { txt = String(payload); }
        vivos = {
          ...vivos,
          [ev.evento]: { count: prev.count + 1, ultimo: txt, ts: new Date().toLocaleTimeString() }
        };
      });
      cleanup.push(unsub);
    }
    if (zones.datos) {
      if (zones.datos.refresh_on) {
        for (const ev of zones.datos.refresh_on) {
          const unsub = subscribe(ev, () => { if (!datosNeedsArgs) loadDatos(); });
          cleanup.push(unsub);
        }
      }
      const matchingOp = zones.formulario.find(f => f.nombre === zones.datos!.op);
      if (matchingOp && matchingOp.args.some(a => a.required)) {
        datosNeedsArgs = true;
        datosTitulo = zones.datos.titulo;
        datosHint = `Ejecuta «${matchingOp.titulo}» en el formulario para ver los datos`;
        error = '';
      } else {
        loadDatos();
      }
    }
  });

  onDestroy(() => {
    for (const u of cleanup) u();
    cleanup = [];
  });
</script>

<section class="panel">
  {#if titulo}<header class="cabecera"><h2>{titulo}</h2></header>{/if}

  {#if error}<div class="error">⚠ {error}</div>{/if}

  <!-- ============ ZONA 0: ESTADOS (ciclo de vida) ============ -->
  {#if zones.estados.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Ciclo de vida</h3>
      <div class="estados-bar">
        {#each zones.estados as est (est.nombre)}
          <span class="estado-pill" class:terminal={est.terminal} style="--est-color: {est.color}">
            <span class="estado-icono">{est.icono}</span>
            {est.nombre.replace(/_/g, ' ')}
          </span>
          {#if !est.terminal}<span class="estado-flecha">→</span>{/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- ============ ZONA 0.5: FLUJO (fases) ============ -->
  {#if zones.flujo.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Flujo de operaciones</h3>
      <div class="fases-bar">
        {#each zones.flujo as fase (fase.nombre)}
          <div class="fase-chip">
            <span class="fase-orden">{fase.orden}</span>
            <span class="fase-nombre">{fase.descripcion || fase.nombre}</span>
            <span class="fase-ops">{fase.ops.length} ops</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ============ ZONA 1: FORMULARIO ============ -->
  {#if zones.formulario.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Formulario</h3>
      {#each zones.formulario as op (op.nombre)}
        <div class="op-card">
          <div class="op-cab">
            <span class="op-nombre">{op.titulo}</span>
            {#if zones.guardas[op.nombre]?.sensible_estado}<span class="guarda-badge" title="Sensible al estado del pedido">⚡ estado</span>{/if}
            <code class="op-rpc">{moduleId}.{op.nombre}.request</code>
          </div>
          {#if op.descripcion}<p class="op-desc">{op.descripcion}</p>{/if}
          <div class="op-campos">
            {#each op.args as arg (arg.nombre)}
              <label class="campo">
                <span class="campo-label" title={arg.nombre}>{labelize(arg.nombre)}{arg.required ? ' *' : ''}</span>
                {#if arg.tipo === 'select'}
                  <select
                    value={(fieldValue(op.nombre, arg) as string) || ''}
                    on:change={(e) => setField(op.nombre, arg, (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">—</option>
                    {#each arg.enum || [] as opt, i}
                      <option value={opt}>{arg.enumLabels?.[i] ?? opt}</option>
                    {/each}
                  </select>
                {:else if arg.tipo === 'ref'}
                  <RefSelect
                    {arg}
                    op={{ nombre: op.nombre }}
                    {moduleId}
                    value={fieldValue(op.nombre, arg)}
                    onchange={(v) => setField(op.nombre, arg, v)}
                  />
                {:else if arg.tipo === 'boolean'}
                  <input
                    type="checkbox"
                    checked={Boolean(fieldValue(op.nombre, arg))}
                    on:change={(e) => setField(op.nombre, arg, (e.target as HTMLInputElement).checked)}
                  />
                {:else if arg.tipo === 'number'}
                  <input
                    type="number"
                    value={(fieldValue(op.nombre, arg) as string) || ''}
                    placeholder={arg.placeholder || arg.nombre}
                    on:input={(e) => setField(op.nombre, arg, (e.target as HTMLInputElement).value)}
                  />
                {:else if arg.tipo === 'json'}
                  <textarea
                    rows="2"
                    placeholder="JSON"
                    value={(fieldValue(op.nombre, arg) as string) || ''}
                    on:input={(e) => setField(op.nombre, arg, (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                {:else if arg.tipo === 'kv'}
                  <div class="kv-par">
                    <input
                      class="kv-clave"
                      placeholder="clave"
                      disabled={Boolean(arg.kvClave)}
                      value={arg.kvClave || kvPart(op.nombre, arg, 'clave')}
                      on:input={(e) => setKvPart(op.nombre, arg, 'clave', (e.target as HTMLInputElement).value)}
                    />
                    <input
                      class="kv-valor"
                      placeholder="valor"
                      value={kvPart(op.nombre, arg, 'valor')}
                      on:input={(e) => setKvPart(op.nombre, arg, 'valor', (e.target as HTMLInputElement).value)}
                    />
                  </div>
                {:else}
                  <input
                    type="text"
                    value={(fieldValue(op.nombre, arg) as string) || ''}
                    placeholder={arg.placeholder || arg.nombre}
                    on:input={(e) => setField(op.nombre, arg, (e.target as HTMLInputElement).value)}
                  />
                {/if}
              </label>
            {/each}
          </div>
          <div class="op-acciones">
            <button
              class="run"
              on:click={() => runOp(op)}
              disabled={busy === op.nombre}
            >{busy === op.nombre ? 'ejecutando…' : 'Ejecutar'}</button>
            {#if resultados[op.nombre]}
              <span class="resultado {resultados[op.nombre].ok ? 'ok' : 'ko'}">
                {resultados[op.nombre].ok ? '✓' : '✗'} {resultados[op.nombre].msg}
              </span>
            {/if}
          </div>
          {#if resultados[op.nombre]?.ok && resultados[op.nombre].data !== undefined}
            <div class="resultado-vista"><ResultView data={resultados[op.nombre].data} /></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- ============ ZONA 2: ACCIONES ============ -->
  {#if zones.acciones.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Acciones</h3>
      <div class="acciones-grid">
        {#each zones.acciones as op (op.nombre)}
          <button
            class="accion"
            on:click={() => runOp(op)}
            disabled={busy === op.nombre}
            title={op.descripcion || `${moduleId}.${op.nombre}.request`}
          >
            {busy === op.nombre ? '…' : op.titulo}
          </button>
        {/each}
      </div>
      {#each zones.acciones as op (op.nombre)}
        {#if resultados[op.nombre]}
          <div class="accion-resultado">
            <span class="resultado {resultados[op.nombre].ok ? 'ok' : 'ko'}">
              {resultados[op.nombre].ok ? '✓' : '✗'} {op.titulo}: {resultados[op.nombre].msg}
            </span>
            {#if resultados[op.nombre].ok && resultados[op.nombre].data !== undefined}
              <div class="resultado-vista"><ResultView data={resultados[op.nombre].data} /></div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- ============ ZONA 3: ESTADOS VIVOS ============ -->
  {#if zones.estadosVivos.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Estados vivos <span class="vivo-dot"></span></h3>
      {#each zones.estadosVivos as ev (ev.evento)}
        {@const s = vivos[ev.evento]}
        <div class="vivo">
          <div class="vivo-cab">
            <code class="vivo-evento">{ev.evento}</code>
            <span class="vivo-sentido {ev.sentido}">{ev.sentido === 'entrada' ? 'escucha' : 'emite'}</span>
            <span class="vivo-count">{s ? s.count : 0}</span>
          </div>
          {#if ev.descripcion}<p class="vivo-desc">{ev.descripcion}</p>{/if}
          {#if s && s.ultimo}
            <div class="vivo-ultimo">
              <span class="vivo-ts">{s.ts}</span>
              <code class="vivo-payload">{s.ultimo.slice(0, 160)}</code>
            </div>
          {:else}
            <p class="vivo-vacio">sin actividad</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- ============ ZONA 4: DATOS ============ -->
  {#if zones.datos}
    <div class="zona">
      <h3 class="zona-titulo">
        Datos — {datosTitulo || zones.datos.titulo}
        {#if !datosNeedsArgs}
          <button class="refrescar" on:click={loadDatos} disabled={datosCargando}>
            {datosCargando ? 'cargando…' : '↻ refrescar'}
          </button>
        {/if}
      </h3>
      {#if datosHint}
        <p class="vivo-vacio">{datosHint}</p>
      {:else if datosFilas.length === 0}
        <p class="vivo-vacio">sin datos</p>
      {:else}
        <div class="tabla-wrap">
          <table class="tabla">
            <thead>
              <tr>
                {#each datosCols as col}
                  <th>{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each datosFilas as fila, i (i)}
                <tr
                  class:clickable={!!zones.detalle && !!fila['id']}
                  class:selected={detalleId === String(fila['id'] || '')}
                  on:click={() => { if (zones.detalle && fila['id']) loadDetalle(String(fila['id'])); }}
                >
                  {#each datosCols as col}
                    <td>{celda(fila[col])}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ============ ZONA 4.5: DETALLE ============ -->
  {#if zones.detalle && detalleData}
    {@const det = zones.detalle}
    {@const estadoActual = detalleEstadoActual()}
    <div class="zona detalle-zona">
      <h3 class="zona-titulo">
        {det.titulo}
        <button class="cerrar-detalle" on:click={closeDetalle}>✕</button>
      </h3>

      {#if detalleCargando}
        <p class="vivo-vacio">cargando…</p>
      {:else}
        <!-- Cabecera -->
        <div class="detalle-cabecera">
          {#each det.cabecera as campo}
            <div class="detalle-campo">
              <span class="detalle-label">{humanize(campo)}</span>
              <span class="detalle-valor" class:estado-valor={campo === 'estado'}>{celda(detalleData[campo])}</span>
            </div>
          {/each}
        </div>

        <!-- Barra de estado -->
        {#if det.estados.length > 0}
          <div class="detalle-estado-bar">
            {#each det.estados as est}
              {@const estInfo = zones.estados.find(e => e.nombre === est)}
              <span
                class="estado-step"
                class:activo={est === estadoActual}
                class:pasado={det.estados.indexOf(est) < det.estados.indexOf(estadoActual)}
                style="--est-color: {estInfo?.color || 'gray'}"
              >
                {#if estInfo}<span class="estado-icono">{estInfo.icono}</span>{/if}
                {est.replace(/_/g, ' ')}
              </span>
              {#if det.estados.indexOf(est) < det.estados.length - 1}
                <span class="estado-flecha">→</span>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Items -->
        {#if Array.isArray(detalleData[det.campo_items]) && (detalleData[det.campo_items] as unknown[]).length > 0}
          {@const items = detalleData[det.campo_items] as Record<string, unknown>[]}
          {@const itemCols = Object.keys(items[0]).filter(k => k !== 'id' && k !== '_id').slice(0, 6)}
          <div class="detalle-items">
            <h4 class="detalle-sub">Items ({items.length})</h4>
            <div class="tabla-wrap">
              <table class="tabla">
                <thead><tr>{#each itemCols as col}<th>{humanize(col)}</th>{/each}</tr></thead>
                <tbody>
                  {#each items as item, i (i)}
                    <tr>{#each itemCols as col}<td>{celda(item[col])}</td>{/each}</tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- Total -->
        {#if detalleData[det.campo_total] !== undefined}
          <div class="detalle-total">
            <span class="detalle-label">Total</span>
            <span class="detalle-total-valor">{celda(detalleData[det.campo_total])}</span>
          </div>
        {/if}

        <!-- Acciones contextuales -->
        {#if det.acciones_contextuales.length > 0}
          <div class="detalle-acciones">
            <h4 class="detalle-sub">Acciones</h4>
            <div class="acciones-grid">
              {#each det.acciones_contextuales as accion}
                {@const guardado = zones.guardas[accion]?.sensible_estado}
                <button
                  class="accion"
                  class:guarded={guardado}
                  on:click={() => runDetalleAction(accion)}
                  disabled={busy === accion}
                  title={guardado ? `Sensible al estado (${estadoActual})` : humanize(accion)}
                >
                  {busy === accion ? '…' : humanize(accion)}
                  {#if guardado}<span class="guarda-badge-sm">⚡</span>{/if}
                </button>
              {/each}
            </div>
            {#each det.acciones_contextuales as accion}
              {#if resultados[accion]}
                <div class="accion-resultado">
                  <span class="resultado {resultados[accion].ok ? 'ok' : 'ko'}">
                    {resultados[accion].ok ? '✓' : '✗'} {humanize(accion)}: {resultados[accion].msg}
                  </span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Datos crudos (lo que no cubre la estructura) -->
        {@const extraKeys = Object.keys(detalleData).filter(k => !det.cabecera.includes(k) && k !== det.campo_items && k !== det.campo_total && k !== 'id')}
        {#if extraKeys.length > 0}
          <details class="detalle-extra">
            <summary>Más campos ({extraKeys.length})</summary>
            <div class="detalle-cabecera">
              {#each extraKeys as campo}
                <div class="detalle-campo">
                  <span class="detalle-label">{humanize(campo)}</span>
                  <span class="detalle-valor">{celda(detalleData[campo])}</span>
                </div>
              {/each}
            </div>
          </details>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ============ ZONA 5: CUSTOM (slot) ============ -->
  <slot name="custom" />
</section>

<style>
  .panel { padding: 1rem 1.25rem; color: var(--color-text, #eeeeee); max-height: 33vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; }
  .cabecera { margin: 0; }
  .cabecera h2 { margin: 0; font-size: 1.05rem; }
  .zona { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.6rem 0.8rem; background: var(--color-surface, #111111); }
  .zona-titulo { margin: 0 0 0.5rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted, #888); display: flex; align-items: center; gap: 0.5rem; }
  .vivo-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  .error { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; }
  .op-card { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.55rem 0.7rem; margin-bottom: 0.5rem; background: var(--color-surface-2, #1a1a1a); }
  .op-cab { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .op-nombre { font-weight: 600; font-size: 0.9rem; }
  .op-rpc { font-size: 0.68rem; color: var(--color-text-muted, #888); }
  .op-desc { margin: 0.25rem 0 0; font-size: 0.78rem; color: var(--color-text-muted, #aaa); }
  .op-campos { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
  .campo { display: flex; flex-direction: column; gap: 2px; }
  .campo-label { font-size: 0.7rem; color: var(--color-text-muted, #aaa); }
  .campo input[type="text"], .campo input[type="number"], .campo select, .campo textarea, .kv-par input {
    font-size: 0.8rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 3px 7px;
    background: var(--color-surface, #111111); color: var(--color-text, #eeeeee); width: 100%; box-sizing: border-box;
  }
  .kv-par { display: flex; gap: 4px; }
  .kv-clave { flex: 1; } .kv-valor { flex: 2; }
  .op-acciones { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .run, .accion, .refrescar { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-primary, #eab308); border-radius: 6px; padding: 3px 10px; background: rgba(245,158,11,0.12); color: var(--color-primary, #eab308); }
  .run:disabled, .accion:disabled, .refrescar:disabled { opacity: 0.5; cursor: default; }
  .resultado { font-size: 0.75rem; }
  .resultado.ok { color: #22c55e; }
  .resultado.ko { color: #ef4444; }
  .resultado-data { margin: 0.4rem 0 0; font-size: 0.72rem; background: #0a0a0a; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 0.4rem 0.55rem; overflow-x: auto; max-height: 140px; color: #9ecaed; }
  .resultado-vista { margin-top: 0.4rem; }
  .acciones-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .accion-resultado { margin-top: 0.5rem; }
  .vivo { border-bottom: 1px dashed var(--color-border, #333); padding: 0.3rem 0; }
  .vivo:last-child { border-bottom: none; }
  .vivo-cab { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .vivo-evento { font-size: 0.78rem; color: var(--color-text, #eee); }
  .vivo-sentido { font-size: 0.62rem; padding: 1px 6px; border-radius: 20px; }
  .vivo-sentido.entrada { background: rgba(148,163,184,0.15); color: var(--color-text-muted, #888); }
  .vivo-sentido.salida { background: rgba(34,197,94,0.15); color: #22c55e; }
  .vivo-count { font-size: 0.72rem; font-weight: 700; color: var(--color-primary, #eab308); }
  .vivo-desc { margin: 0.15rem 0 0; font-size: 0.72rem; color: var(--color-text-muted, #888); }
  .vivo-ultimo { display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.15rem; }
  .vivo-ts { font-size: 0.65rem; color: var(--color-text-muted, #666); white-space: nowrap; }
  .vivo-payload { font-size: 0.7rem; color: #9ecaed; overflow-wrap: anywhere; }
  .vivo-vacio { margin: 0.15rem 0 0; font-size: 0.72rem; color: var(--color-text-muted, #666); }
  .refrescar { margin-left: auto; }
  .tabla-wrap { overflow-x: auto; }
  .tabla { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  .tabla th, .tabla td { border: 1px solid var(--color-border, #333); padding: 3px 7px; text-align: left; white-space: nowrap; }
  .tabla th { background: var(--color-surface-2, #1a1a1a); color: var(--color-text-muted, #aaa); font-weight: 600; }
  .tabla td { color: var(--color-text, #ddd); }
  .estados-bar { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .estado-pill { display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, var(--est-color, gray) 15%, transparent); border: 1px solid color-mix(in srgb, var(--est-color, gray) 30%, transparent); color: var(--color-text, #eee); white-space: nowrap; }
  .estado-pill.terminal { opacity: 0.7; }
  .estado-icono { font-size: 0.8rem; }
  .estado-flecha { color: var(--color-text-muted, #666); font-size: 0.7rem; }
  .fases-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .fase-chip { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--color-border, #333); background: var(--color-surface-2, #1a1a1a); }
  .fase-orden { width: 16px; height: 16px; border-radius: 50%; background: var(--color-primary, #eab308); color: #000; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; }
  .fase-nombre { color: var(--color-text, #eee); }
  .fase-ops { font-size: 0.6rem; color: var(--color-text-muted, #888); }
  .guarda-badge { font-size: 0.6rem; padding: 1px 5px; border-radius: 4px; background: rgba(245,158,11,0.15); color: #f59e0b; white-space: nowrap; }

  /* Clickable rows (cadena lista→detalle) */
  .tabla tbody tr.clickable { cursor: pointer; }
  .tabla tbody tr.clickable:hover { background: rgba(245,158,11,0.08); }
  .tabla tbody tr.selected { background: rgba(245,158,11,0.15); border-left: 2px solid var(--color-primary, #eab308); }

  /* Zona 4.5: DETALLE */
  .detalle-zona { border-color: var(--color-primary, #eab308); background: var(--color-surface-2, #1a1a1a); }
  .detalle-cabecera { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; margin-bottom: 0.5rem; }
  .detalle-campo { display: flex; flex-direction: column; gap: 1px; }
  .detalle-label { font-size: 0.65rem; color: var(--color-text-muted, #888); text-transform: uppercase; letter-spacing: 0.03em; }
  .detalle-valor { font-size: 0.85rem; color: var(--color-text, #eee); word-break: break-word; }
  .estado-valor { font-weight: 700; color: var(--color-primary, #eab308); }
  .detalle-estado-bar { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem; padding: 0.35rem 0; }
  .estado-step { font-size: 0.68rem; padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, var(--est-color, gray) 10%, transparent); border: 1px solid color-mix(in srgb, var(--est-color, gray) 20%, transparent); color: var(--color-text-muted, #888); white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; transition: all 0.15s; }
  .estado-step.activo { background: color-mix(in srgb, var(--est-color, gray) 25%, transparent); border-color: color-mix(in srgb, var(--est-color, gray) 50%, transparent); color: var(--color-text, #eee); font-weight: 700; }
  .estado-step.pasado { background: color-mix(in srgb, var(--est-color, gray) 15%, transparent); color: var(--color-text, #ccc); }
  .detalle-items { margin: 0.5rem 0; }
  .detalle-sub { margin: 0 0 0.3rem; font-size: 0.72rem; color: var(--color-text-muted, #aaa); font-weight: 600; }
  .detalle-total { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-top: 1px solid var(--color-border, #333); margin-top: 0.3rem; }
  .detalle-total-valor { font-size: 1rem; font-weight: 700; color: var(--color-primary, #eab308); }
  .detalle-acciones { margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid var(--color-border, #333); }
  .accion.guarded { border-color: #f59e0b; background: rgba(245,158,11,0.08); }
  .guarda-badge-sm { font-size: 0.6rem; margin-left: 2px; }
  .detalle-extra { margin-top: 0.4rem; font-size: 0.75rem; }
  .detalle-extra summary { cursor: pointer; color: var(--color-text-muted, #888); font-size: 0.72rem; padding: 0.2rem 0; }
  .cerrar-detalle { margin-left: auto; cursor: pointer; background: none; border: 1px solid var(--color-border, #333); border-radius: 4px; color: var(--color-text-muted, #888); font-size: 0.75rem; padding: 1px 6px; line-height: 1; }
  .cerrar-detalle:hover { color: var(--color-text, #eee); border-color: var(--color-text-muted, #888); }
</style>
