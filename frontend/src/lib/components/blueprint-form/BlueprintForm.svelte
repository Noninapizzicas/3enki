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
  import { deriveZones, labelize, type BlueprintArg, type BlueprintOp, type BlueprintEventoVivo, type BlueprintDatos } from './blueprint-zones';
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
      const v = formValues[op]?.[arg.nombre];
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
      const res = await mqttRequest(moduleId, op.nombre, { project_id: pid, ...payload });
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
      const res = await mqttRequest(moduleId, d.op, { project_id: pid });
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

  <!-- ============ ZONA 1: FORMULARIO ============ -->
  {#if zones.formulario.length > 0}
    <div class="zona">
      <h3 class="zona-titulo">Formulario</h3>
      {#each zones.formulario as op (op.nombre)}
        <div class="op-card">
          <div class="op-cab">
            <span class="op-nombre">{op.titulo}</span>
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
                <tr>
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
</style>
