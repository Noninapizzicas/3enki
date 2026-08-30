<script lang="ts">
  /**
   * RecetasPanel — LA CARA DEL JEFE del RECETARIO (F7).
   * Reescribe el panel de otra generación (Browser/Card/Detail/Historial siguen
   * en el dir, este panel ya no los importa): cinta-estado + ref-select de
   * receta → TABLA de líneas (ingrediente×cantidad) + crear (editor-bloque)
   * + validar (freno AJV en vivo).
   *
   * El RECETARIO es el ORIGEN del coste: cada receta = { nombre, tipo, rinde,
   * lineas[] } y cada línea = ingrediente × cantidad exacta con unidad
   * canónica (g|ml|ud). El coste lo deriva escandallo (lee recetas.listar
   * {incluir_lineas:true} y escribe de vuelta vía escandallo.coste.calculado)
   * — aquí se MUESTRA, no se edita (invariante INV1 del esquema-jefe).
   *
   * Composición 3 capas (esquema-jefe de recetas):
   *   - CAPA 1-2 (SELECCIONAR/INFORMARSE): cinta-estado "n recetas · n con
   *     coste · n incompletas" + ref-select de receta (borrador/en_servicio)
   *     → TABLA de líneas ingrediente×cantidad + coste si escandallo ya lo
   *     escribió.
   *   - CAPA 3 (DECLARAR, ROL JEFE):
   *     · H1 crear receta — editor-bloque: nombre + tipo + rinde + líneas
   *       dinámicas (ref del catálogo recetas.ingredientes, cantidad, unidad,
   *       notas) con el FRENO validar en vivo (errors[].path clicables).
   *     · H2 validar — dictamen {valid, errors[]} bajo el editor (función
   *       pura, sin señal).
   *
   * project_id (R6, lección del bug del escandallo): recetas.listar EXIGE
   * project_id (index.js L38) — TODOS los RPC del store lo inyectan.
   *
   * Señal manda (R3): suscripción a receta.creada (1× tras verificar
   * aterrizaje) + receta.actualizada (1× por coste aplicado por escandallo)
   * → re-lee listar. Nunca recarga, nunca estado optimista.
   *
   * Patrón del repo: IngredientesPanel (estación del jefe) — mqttRequest +
   * señales dot-notation + error nombrado en su tarjeta.
   */

  import { onMount } from 'svelte';
  import {
    recetario,
    cinta,
    recetaSeleccionada,
    catalogoIngredientes,
    mutacionesPendientes,
    errorMutacion,
    loadRecetario,
    cargarReceta,
    cargarCatalogoIngredientes,
    resetRecetas,
    initRecetasSubscriptions,
    crearReceta,
    validarReceta,
    formatearEuros,
    describeError,
    type RecetaResumen,
    type Receta,
    type RecetaLinea,
    type CatalogoIngrediente,
    type ValidarDictamen
  } from './stores/recetas';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- CAPA 1: ref-select de receta + búsqueda local ----
  let recetaSel = '';
  let busqueda = '';

  /** Filtro local por búsqueda sobre el recetario ya leído. */
  $: visibles = $recetario.filter((r) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return r.nombre.toLowerCase().includes(q) || (r.tipo || '').toLowerCase().includes(q);
  });

  /** Receta seleccionada (ficha completa de obtener) para la TABLA de líneas. */
  $: recetaActiva = $recetaSeleccionada;

  // ---- CAPA 2: TABLA de líneas de la receta seleccionada ----
  function elegirReceta(e: Event): void {
    const v = (e.currentTarget as HTMLSelectElement).value;
    recetaSel = v;
    if (v) void cargarReceta(v);
  }

  // ---- CAPA 3 · H1 · crear receta (editor-bloque) ----
  let crearAbierto = false;
  let crearNombre = '';
  let crearTipo = 'pizza';
  let crearRindeCantidad = '';
  let crearRindeUnidad: 'ud' | 'g' | 'ml' = 'ud';
  let crearLineas: Array<{ ref: string; nombre: string; cantidad: string; unidad: 'g' | 'ml' | 'ud'; notas: string }> = [];
  let crearNotas = '';
  let crearBusy = false;
  let crearError: string | null = null;
  /** Dictamen de crear (201/409/503 nombrados). */
  let crearDictamen: { receta_id: string; nombre: string; estado_operativo: string; incompleta: boolean; campos_pendientes: string[] } | null = null;
  /** Dictamen del freno validar en vivo. */
  let validarDictamen: ValidarDictamen | null = null;

  /** Tipos ya usados en el recetario (datalist del input tipo). */
  $: tiposUsados = Array.from(new Set($recetario.map((r) => r.tipo).filter(Boolean))).sort();

  function abrirCrear(): void {
    crearAbierto = true;
    crearNombre = '';
    crearTipo = 'pizza';
    crearRindeCantidad = '';
    crearRindeUnidad = 'ud';
    crearLineas = [];
    crearNotas = '';
    crearError = null;
    crearDictamen = null;
    validarDictamen = null;
  }

  function cerrarCrear(): void {
    crearAbierto = false;
    crearDictamen = null;
    validarDictamen = null;
  }

  function anadirLinea(): void {
    crearLineas = [...crearLineas, { ref: '', nombre: '', cantidad: '', unidad: 'g', notas: '' }];
  }

  function quitarLinea(idx: number): void {
    crearLineas = crearLineas.filter((_, i) => i !== idx);
  }

  /** Construye el borrador de receta (modelo canónico) para validar/crear. */
  function borradorReceta(): { nombre: string; tipo: string; rinde?: { cantidad: number; unidad: string }; lineas: RecetaLinea[]; notas?: string } {
    const lineas: RecetaLinea[] = crearLineas
      .filter((l) => l.nombre.trim() || l.ref.trim())
      .map((l) => ({
        ref: l.ref.trim() || l.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        nombre: l.nombre.trim(),
        cantidad: Number(l.cantidad) || 0,
        unidad: l.unidad,
        ...(l.notas.trim() ? { notas: l.notas.trim() } : {})
      }));
    const rindeCant = Number(crearRindeCantidad);
    return {
      nombre: crearNombre.trim(),
      tipo: crearTipo.trim() || 'pizza',
      ...(rindeCant > 0 ? { rinde: { cantidad: rindeCant, unidad: crearRindeUnidad } } : {}),
      lineas,
      ...(crearNotas.trim() ? { notas: crearNotas.trim() } : {})
    };
  }

  /** El FRENO en vivo: valida el borrador contra receta.schema.json (AJV). */
  async function correrValidar(): Promise<void> {
    if (!crearNombre.trim()) {
      validarDictamen = { valid: false, errors: [{ path: '/nombre', keyword: 'required', message: '/nombre es requerido' }] };
      return;
    }
    validarDictamen = await validarReceta(borradorReceta());
  }

  async function confirmarCrear(): Promise<void> {
    crearBusy = true;
    crearError = null;
    try {
      const dictamen = await crearReceta(borradorReceta()); // señal 1× receta.creada (R3)
      crearDictamen = dictamen;
      crearNombre = '';
      crearLineas = [];
      crearNotas = '';
      validarDictamen = null;
    } catch (err) {
      crearError = describeError(err);
    } finally {
      crearBusy = false;
    }
  }

  // ---- ciclo de vida + señales (R3) ----
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initRecetasSubscriptions();
    void cargarCatalogoIngredientes();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetRecetas();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadRecetario();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetRecetas();
    }
  }

  /** Resuelve el nombre de un ref de línea contra el catálogo (o el propio ref). */
  function nombreDeRef(ref: string | null | undefined, nombre: string): string {
    if (nombre) return nombre;
    const ing = $catalogoIngredientes.find((i) => i.id === ref || i.nombre === ref);
    return ing?.nombre || ref || '';
  }
</script>

<div class="jefe-recetas" data-recetas-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">CEO</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">recetario · origen del coste (el coste lo deriva escandallo, se muestra)</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $errorMutacion}
    <div class="cinta-error">{$errorMutacion}</div>
  {/if}

  <!-- CAPA 1-2 · cinta-estado: el pulso sin navegar -->
  <div class="cinta-estado">
    <span class="pulso">{$cinta.total} recetas</span>
    <span class="pulso pulso-coste">{$cinta.conCoste} con coste ({$cinta.conCostePct}%)</span>
    <span class="pulso pulso-incompleta">{$cinta.incompletas} incompletas</span>
  </div>

  <!-- CAPA 1 · ref-select de receta + búsqueda local + crear -->
  <div class="fila-herramientas">
    <select class="ref-select" value={recetaSel} on:change={elegirReceta} aria-label="Receta de trabajo">
      <option value="">seleccionar receta…</option>
      {#each visibles as r (r.receta_id)}
        <option value={r.receta_id}>
          {r.nombre}{r.incompleta ? ' (incompleta)' : ''}{typeof r.coste_unidad === 'number' && r.coste_unidad > 0 ? '' : ' · sin coste'}
        </option>
      {/each}
    </select>
    <input
      class="buscador"
      type="search"
      placeholder="buscar receta…"
      bind:value={busqueda}
    />
    <button class="btn-jefe" on:click={abrirCrear}>Crear receta</button>
  </div>

  {#if !$activeProjectId}
    <div class="vacio">sin proyecto activo</div>
  {:else if $cinta.total === 0}
    <div class="vacio">recetario vacío — crea la primera receta</div>
  {:else if visibles.length === 0}
    <div class="vacio">nada coincide con la búsqueda</div>
  {/if}

  <!-- CAPA 2 · TABLA de líneas de la receta seleccionada -->
  {#if recetaActiva}
    <div class="tabla-recetario">
      <header>
        <h4>{recetaActiva.nombre}</h4>
        <span class="meta">
          {recetaActiva.tipo} · v{recetaActiva.version} · {recetaActiva.estado_operativo}
          {#if recetaActiva.rinde}· rinde {recetaActiva.rinde.cantidad} {recetaActiva.rinde.unidad}{/if}
        </span>
        {#if typeof recetaActiva.coste_unidad === 'number' && recetaActiva.coste_unidad > 0}
          <span class="coste">coste unidad {formatearEuros(recetaActiva.coste_unidad)}</span>
        {:else}
          <span class="coste sin-coste">sin coste (pendiente de escandallo)</span>
        {/if}
      </header>
      {#if (recetaActiva.lineas || []).length === 0}
        <div class="vacio">sin líneas — receta incompleta</div>
      {:else}
        <table>
          <thead>
            <tr><th>ingrediente</th><th>cantidad</th><th>unidad</th><th>notas</th></tr>
          </thead>
          <tbody>
            {#each (recetaActiva.lineas || []) as l (l.ref + l.nombre)}
              <tr>
                <td>{nombreDeRef(l.ref, l.nombre)}</td>
                <td class="num">{l.cantidad}</td>
                <td>{l.unidad}</td>
                <td class="notas">{l.notas || ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if (recetaActiva.campos_pendientes || []).length > 0}
        <div class="pendientes">pendientes: {(recetaActiva.campos_pendientes || []).join(', ')}</div>
      {/if}
    </div>
  {/if}

  <!-- CAPA 3 · H1 · crear receta (editor-bloque) -->
  {#if crearAbierto}
    <div class="editor-crear" role="dialog" aria-label="Crear receta">
      <header>
        <h5>Crear receta</h5>
        <button class="btn-neutro btn-mini" on:click={cerrarCrear}>cerrar</button>
      </header>

      <div class="campos">
        <label>
          nombre
          <input bind:value={crearNombre} disabled={crearBusy} placeholder="Margherita" on:input={() => void correrValidar()} />
        </label>
        <label>
          tipo
          <input list="tipos-recetas" bind:value={crearTipo} disabled={crearBusy} placeholder="pizza" on:input={() => void correrValidar()} />
          <datalist id="tipos-recetas">
            {#each tiposUsados as t (t)}
              <option value={t} />
            {/each}
          </datalist>
        </label>
        <div class="rinde">
          <label>
            rinde cantidad
            <input type="number" min="0" bind:value={crearRindeCantidad} disabled={crearBusy} placeholder="1" />
          </label>
          <label>
            unidad
            <select bind:value={crearRindeUnidad} disabled={crearBusy}>
              <option value="ud">ud</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </label>
        </div>
      </div>

      <!-- líneas dinámicas: ref del catálogo + cantidad + unidad + notas -->
      <div class="lineas">
        <h6>Líneas (ingrediente × cantidad)</h6>
        {#each crearLineas as l, i (i)}
          <div class="linea">
            <select
              class="ref-select"
              bind:value={l.ref}
              disabled={crearBusy}
              on:change={() => {
                const ing = $catalogoIngredientes.find((x) => x.id === l.ref);
                if (ing && !l.nombre.trim()) l.nombre = ing.nombre;
                void correrValidar();
              }}
            >
              <option value="">— ingrediente —</option>
              {#each $catalogoIngredientes as ing (ing.id || ing.nombre)}
                <option value={ing.id || ing.nombre}>{ing.nombre}</option>
              {/each}
            </select>
            <input
              class="linea-nombre"
              bind:value={l.nombre}
              disabled={crearBusy}
              placeholder="nombre"
              on:input={() => void correrValidar()}
            />
            <input
              class="linea-cantidad"
              type="number"
              min="0"
              bind:value={l.cantidad}
              disabled={crearBusy}
              placeholder="cantidad"
              on:input={() => void correrValidar()}
            />
            <select class="linea-unidad" bind:value={l.unidad} disabled={crearBusy}>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="ud">ud</option>
            </select>
            <input
              class="linea-notas"
              bind:value={l.notas}
              disabled={crearBusy}
              placeholder="notas"
            />
            <button class="btn-neutro btn-mini" disabled={crearBusy} on:click={() => quitarLinea(i)}>✕</button>
          </div>
        {/each}
        <button class="btn-neutro btn-mini" disabled={crearBusy} on:click={anadirLinea}>+ añadir línea</button>
      </div>

      <label class="notas">
        notas
        <input bind:value={crearNotas} disabled={crearBusy} placeholder="notas de la receta" />
      </label>

      <!-- H2 · dictamen del FRENO validar en vivo -->
      {#if validarDictamen}
        <div class="dictamen-validar" class:valido={validarDictamen.valid}>
          {#if validarDictamen.valid}
            <span class="ok">✓ forma válida</span>
          {:else}
            <span class="ko">✗ forma inválida</span>
            <ul>
              {#each validarDictamen.errors as e (e.path + e.keyword)}
                <li>{e.message}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#if crearError}
        <div class="err-ficha">{crearError}</div>
      {/if}

      {#if crearDictamen}
        <div class="dictamen-crear">
          <h6>receta creada — {crearDictamen.nombre}</h6>
          <p>
            {crearDictamen.estado_operativo}{crearDictamen.incompleta ? ' (incompleta)' : ''}
            {#if (crearDictamen.campos_pendientes || []).length > 0}· pendientes: {crearDictamen.campos_pendientes.join(', ')}{/if}
          </p>
        </div>
      {/if}

      <div class="confirm-gestos">
        <button
          class="btn-jefe"
          disabled={crearBusy || !crearNombre.trim() || (validarDictamen !== null && !validarDictamen.valid)}
          on:click={() => void confirmarCrear()}
        >
          {crearBusy ? 'creando…' : 'crear receta'}
        </button>
        <button class="btn-neutro" on:click={cerrarCrear}>dejarlo estar</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .jefe-recetas {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.5rem;
    font-size: 13px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    overflow-y: auto;
    height: 100%;
  }

  .actor-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .badge-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: rgba(250, 204, 21, 0.15);
    color: #facc15;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .badge-label {
    font-weight: 600;
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }
  .badge-sync {
    color: #60a5fa;
  }

  .cinta-error,
  .err-ficha {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
  }

  .cinta-estado {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .pulso {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 12px;
  }
  .pulso-coste {
    color: #60a5fa;
  }
  .pulso-incompleta {
    color: #facc15;
  }

  .fila-herramientas {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .ref-select,
  .buscador,
  input,
  select {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-primary, rgba(228, 228, 231, 1));
    border-radius: 4px;
    padding: 0.3rem 0.45rem;
    font-size: 13px;
  }
  .ref-select {
    min-width: 200px;
  }
  .buscador {
    flex: 1;
    min-width: 120px;
  }

  .btn-jefe {
    background: rgba(250, 204, 21, 0.15);
    color: #facc15;
    border: 1px solid rgba(250, 204, 21, 0.4);
    border-radius: 4px;
    padding: 0.35rem 0.7rem;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-jefe:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-neutro {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-mini {
    padding: 0.15rem 0.4rem;
    font-size: 11px;
  }

  .vacio {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    padding: 1rem;
    text-align: center;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .tabla-recetario {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 0.5rem;
  }
  .tabla-recetario header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }
  .tabla-recetario h4 {
    margin: 0;
    font-size: 14px;
  }
  .meta {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 12px;
  }
  .coste {
    color: #60a5fa;
    font-weight: 600;
    font-size: 12px;
  }
  .coste.sin-coste {
    color: #facc15;
    font-weight: 400;
  }
  .tabla-recetario table {
    width: 100%;
    border-collapse: collapse;
  }
  .tabla-recetario th,
  .tabla-recetario td {
    text-align: left;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .tabla-recetario th {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .num {
    text-align: right;
  }
  .notas {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .pendientes {
    margin-top: 0.4rem;
    color: #facc15;
    font-size: 12px;
  }

  .editor-crear {
    border: 1px solid rgba(250, 204, 21, 0.3);
    border-radius: 6px;
    padding: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .editor-crear header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .editor-crear h5 {
    margin: 0;
    font-size: 14px;
  }
  .campos {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .campos label,
  .notas {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .rinde {
    display: flex;
    gap: 0.4rem;
  }
  .lineas {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .lineas h6 {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .linea {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .linea .ref-select {
    min-width: 150px;
  }
  .linea-nombre {
    flex: 1;
    min-width: 100px;
  }
  .linea-cantidad {
    width: 70px;
  }
  .linea-unidad {
    width: 60px;
  }
  .linea-notas {
    flex: 1;
    min-width: 80px;
  }

  .dictamen-validar {
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    font-size: 12px;
  }
  .dictamen-validar.valido {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
  }
  .dictamen-validar:not(.valido) {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
  }
  .dictamen-validar ul {
    margin: 0.3rem 0 0 1rem;
    padding: 0;
  }
  .dictamen-crear {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
    border-radius: 4px;
    padding: 0.4rem 0.5rem;
    font-size: 12px;
  }
  .dictamen-crear h6 {
    margin: 0 0 0.2rem;
  }
  .dictamen-crear p {
    margin: 0;
  }
  .confirm-gestos {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
  }
</style>
