<script lang="ts">
  /**
   * CatalogoModelosPanel — la CINTA + ALTA del catálogo de modelos 3D (F7, prisma-universal).
   *
   * REEMPLAZA el envoltorio genérico (BlueprintForm): panel ESPECÍFICO con store MQTT,
   * siguiendo el patrón de PedidosPanel (modules/pedidos/PedidosPanel.svelte).
   *
   * Dualidad del blueprint (F6½): registrar = rol JEFE (única escritura del custodio);
   * listar/obtener/categorias = lecturas que alimentan esa decisión → ROL TRABAJADOR.
   *
   * UN SOLO panel, DOS caras (pestañas dentro de la MISMA vista — SUMAR, no crear panel nuevo):
   *   - PESTAÑA JEFE (conservada): CINTA (listar) + ALTA (registrar, única escritura) + DETALLE.
   *   - PESTAÑA TRABAJADOR (NUEVA — lente operador): cara de CONSULTA OPERATIVA, LECTOR casi puro.
   *       · CINTA "qué hay disponible" (listar) — la alacena de piezas imprimibles.
   *       · ORDEN por categoría (categorias) — select/badge que agrupa la cinta.
   *       · FICHA de impresión (obtener) — gesto rey del worker: archivo .3mf, material,
   *         dimensiones, tiempo/peso. SIN gesto de escritura (el trabajador no registra).
   *
   * SEÑAL pareada (catalogo.modelo_registrado) → re-lee la cinta (R3, nunca recarga) — el worker
   * la recibe como novedad (pieza nueva), pero NO la dispara (es del jefe).
   *
   * Lenguaje visual: color=estado, icono=entidad (🧊), texto=precisión. Los 3 canales
   * refuerzan el mismo mensaje.
   */

  import { onMount } from 'svelte';
  import {
    modelos,
    categorias,
    detalle,
    catalogoLoading,
    detalleLoading,
    catalogoError,
    mutacionesPendientes,
    totalModelos,
    ultimoRegistrado,
    loadCatalogo,
    obtenerModelo,
    registrarModelo,
    resetCatalogo,
    initCatalogoSubscriptions,
    describeError,
    type ModeloFila,
    type ModeloAlta
  } from './stores/catalogo';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- pestañas: UN panel, dos caras (jefe / trabajador) ----
  type TabActiva = 'jefe' | 'trabajador';
  let tabActiva: TabActiva = 'jefe';

  // ---- cara TRABAJADOR (LECTOR): ficha + cinta + categorías, sin escritura ----
  let filaWorker: ModeloFila | null = null;
  let filtroCategoria = '';

  /** Cinta operativa del worker: se re-agrupa por categoría (categorias). Derivado, no {@const}. */
  $: modelosWorker = filtroCategoria
    ? $modelos.filter((m) => m.categoria === filtroCategoria)
    : $modelos;

  function seleccionarTab(tab: TabActiva): void {
    if (tab === 'trabajador') {
      filaWorker = null; // cara fresca al entrar: sin ficha colgada de la pasada anterior
    }
    tabActiva = tab;
  }

  /** Gesto rey del worker: tocar la pieza → FICHA de impresión (obtener). Reusa obtenerModelo. */
  function abrirFichaTrabajador(fila: ModeloFila): void {
    const pid = $sessionProjectId;
    if (!pid) return;
    filaWorker = fila;
    void obtenerModelo(pid, fila.id); // llena $detalle (mismo store, sin duplicar)
  }

  // ---- cara JEFE: modal de alta ----
  let altaAbierta = false;
  let altaBusy = false;
  let altaError: string | null = null;
  let altaNombre = '';
  let altaCategoria = '';
  let altaArchivo = '';
  let altaOrigen = '';
  let altaMaterial = '';
  let altaDimensiones = '';
  let altaTiempo = '';
  let altaPeso = '';

  // ---- detalle (jefe) ----
  let filaSeleccionada: ModeloFila | null = null;

  /* Suscripción a las señales pareadas — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initCatalogoSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetCatalogo();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCatalogo(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetCatalogo();
    }
  }

  function abrirAlta(): void {
    const cats = $categorias;
    altaAbierta = true;
    altaBusy = false;
    altaError = null;
    altaNombre = '';
    altaCategoria = cats.length ? cats[0] : '';
    altaArchivo = '';
    altaOrigen = '';
    altaMaterial = '';
    altaDimensiones = '';
    altaTiempo = '';
    altaPeso = '';
  }

  function cerrarAlta(): void {
    if (altaBusy) return; // no cerrar mientras registra
    altaAbierta = false;
  }

  async function ejecutarAlta(): Promise<void> {
    const pid = $sessionProjectId;
    if (!pid) return;
    if (!altaNombre.trim()) {
      altaError = 'el nombre es obligatorio';
      return;
    }
    altaBusy = true;
    altaError = null;
    try {
      const datos: ModeloAlta = {
        nombre: altaNombre.trim(),
        categoria: altaCategoria || undefined,
        archivo3mf: altaArchivo.trim() || undefined,
        origen: altaOrigen.trim() || undefined,
        metadatos: {
          material: altaMaterial.trim() || undefined,
          dimensiones: altaDimensiones.trim() || undefined,
          tiempo_estimado: altaTiempo.trim() || undefined,
          peso_estimado: altaPeso.trim() || undefined
        }
      };
      await registrarModelo(pid, datos);
      altaAbierta = false; // la señal catalogo.modelo_registrado re-lee la cinta (R3)
    } catch (err) {
      altaError = describeError(err);
    } finally {
      altaBusy = false;
    }
  }

  function abrirDetalle(fila: ModeloFila): void {
    const pid = $sessionProjectId;
    if (!pid) return;
    filaSeleccionada = fila;
    void obtenerModelo(pid, fila.id);
  }

  function cerrarDetalle(): void {
    filaSeleccionada = null;
  }

  /** HH:MM (es-ES) de un ISO para el detalle. */
  function fechacorta(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  function origenLabel(origen: string | null | undefined): string {
    return origen || 'desconocido';
  }
  function categoriaLabel(categoria: string | null | undefined): string {
    return categoria || 'sin_categoria';
  }
</script>

<div class="catalogo-panel" data-catalogo-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">🧊</span>
    <span class="badge-label">Catálogo 3D</span>
    <span class="badge-scope">CUSTODIO · registrar es la única escritura (jefe) · las lecturas alimentan la operación (trabajador)</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  <!-- PESTAÑAS: UN panel, DOS caras — se SUMA la cara del trabajador al jefe (no un panel nuevo) -->
  <div class="tabs" role="tablist" aria-label="caras del panel">
    <button
      class="tab"
      class:activo={tabActiva === 'jefe'}
      role="tab"
      aria-selected={tabActiva === 'jefe'}
      on:click={() => seleccionarTab('jefe')}
    >🛠️ Jefe <span class="tab-sub">alta y decisión</span></button>
    <button
      class="tab"
      class:activo={tabActiva === 'trabajador'}
      role="tab"
      aria-selected={tabActiva === 'trabajador'}
      on:click={() => seleccionarTab('trabajador')}
    >🖨️ Trabajador <span class="tab-sub">ficha · cinta · categorías</span></button>
  </div>

  {#if $catalogoError}
    <div class="cinta-error">⚠️ {$catalogoError}</div>
  {/if}

  {#if tabActiva === 'jefe'}
    <!-- CABECERA: pulso + botón nuevo -->
    <div class="cabecera">
      <span class="pulso">🧊 {$totalModelos} modelos</span>
      <span class="pulso-cats" title="select de categorías del alta">🏷️ {$categorias.length} categorías</span>
      <button
        class="btn-jefe"
        on:click={abrirAlta}
        title="alta de un modelo 3D (catalogo.registrar → catalogo.modelo_registrado)"
      >➕ Modelo</button>
    </div>

    {#if $ultimoRegistrado}
      <div class="senal-confirmacion">
        🆕 registrado <strong>{$ultimoRegistrado.nombre}</strong> · la cinta se refrescó sola
      </div>
    {/if}

    <!-- CINTA (listar) -->
    {#if $catalogoLoading && $modelos.length === 0}
      <div class="vacio">cargando modelos…</div>
    {:else if $modelos.length === 0}
      <div class="vacio" role="button" tabindex="0" on:click={abrirAlta} on:keydown={(e) => e.key === 'Enter' && abrirAlta()}>
        <div class="vacio-ico">🧊</div>
        <div class="vacio-txt">sin modelos — añade el primero</div>
        <button class="btn-neutro" on:click|stopPropagation={abrirAlta}>➕ Añadir modelo</button>
      </div>
    {:else}
      <div class="cinta">
        <div class="cinta-head">
          <span class="th th-nombre">Nombre</span>
          <span class="th th-cat">Categoría</span>
          <span class="th th-origen">Origen</span>
        </div>
        {#each $modelos as fila (fila.id)}
          <article
            class="fila"
            role="button"
            tabindex="0"
            on:click={() => abrirDetalle(fila)}
            on:keydown={(e) => e.key === 'Enter' && abrirDetalle(fila)}
          >
            <span class="td td-nombre">
              <span class="td-ico">🧊</span>
              <span class="td-valor">{fila.nombre}</span>
            </span>
            <span class="td td-cat">
              <span class="chip-cat">{categoriaLabel(fila.categoria)}</span>
            </span>
            <span class="td td-origen">{origenLabel(fila.origen)}</span>
          </article>
        {/each}
      </div>
    {/if}

    <div class="pie-hint">toca una fila para ver el detalle · el alta re-lee la cinta por señal, no recarga</div>

    <!-- MODAL DE ALTA (registrar, ROL JEFE) -->
    {#if altaAbierta}
      <div class="overlay" on:click={cerrarAlta}>
        <div class="panel" on:click|stopPropagation>
          <h3 class="panel-titulo">➕ Registrar modelo</h3>
          {#if altaError}
            <div class="err-panel">⚠️ {altaError}</div>
          {/if}
          <label class="campo">
            <span>Nombre <em>· obligatorio</em></span>
            <input
              class="input"
              bind:value={altaNombre}
              placeholder="nombre del modelo"
              on:keydown={(e) => e.key === 'Enter' && ejecutarAlta()}
            />
          </label>
          <label class="campo">
            <span>Categoría</span>
            <select class="input" bind:value={altaCategoria}>
              <option value="">sin categoría</option>
              {#if $categorias.length === 0}
                <option value="sin_categoria" disabled>sin categoría</option>
              {:else}
                {#each $categorias as c (c)}
                  <option value={c}>{c}</option>
                {/each}
              {/if}
            </select>
          </label>
          <label class="campo">
            <span>Archivo .3mf</span>
            <input class="input" bind:value={altaArchivo} placeholder="ruta/ref del .3mf" />
          </label>
          <label class="campo">
            <span>Origen</span>
            <input class="input" bind:value={altaOrigen} placeholder="desconocido | importado | diseñado" />
          </label>
          <fieldset class="grupo-metadatos">
            <legend>Metadatos <span class="muted">· huecos como "desconocido"</span></legend>
            <div class="grid2">
              <label class="campo"><span>Material</span><input class="input" bind:value={altaMaterial} placeholder="PLA / PETG…" /></label>
              <label class="campo"><span>Dimensiones</span><input class="input" bind:value={altaDimensiones} placeholder="120 × 80 × 40 mm" /></label>
              <label class="campo"><span>Tiempo est.</span><input class="input" bind:value={altaTiempo} placeholder="3 h 20 m" /></label>
              <label class="campo"><span>Peso est.</span><input class="input" bind:value={altaPeso} placeholder="85 g" /></label>
            </div>
          </fieldset>
          <div class="panel-gestos">
            <button class="btn-jefe" disabled={altaBusy} on:click={ejecutarAlta}>
              {altaBusy ? '⏳ registrando…' : '🆕 Registrar'}
            </button>
            <button class="btn-neutro" disabled={altaBusy} on:click={cerrarAlta}>cerrar</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- DETALLE (obtener) -->
    {#if filaSeleccionada}
      <div class="overlay" on:click={cerrarDetalle}>
        <div class="panel panel-detalle" on:click|stopPropagation>
          <h3 class="panel-titulo">🧊 {filaSeleccionada.nombre}</h3>
          {#if $detalleLoading}
            <div class="vacio">cargando detalle…</div>
          {:else if $detalle}
            <dl class="detalle-campos">
              <dt>Categoría</dt>
              <dd><span class="chip-cat">{categoriaLabel($detalle.categoria)}</span></dd>
              <dt>Origen</dt>
              <dd>{origenLabel($detalle.origen)}</dd>
              <dt>Archivo .3mf</dt>
              <dd><code>{$detalle.archivo3mf || '—'}</code></dd>
              <dt>Creado</dt>
              <dd>{fechacorta($detalle.created_at)}</dd>
              <dt>Material</dt>
              <dd>{$detalle.metadatos?.material || 'desconocido'}</dd>
              <dt>Dimensiones</dt>
              <dd>{$detalle.metadatos?.dimensiones || 'desconocido'}</dd>
              <dt>Tiempo est.</dt>
              <dd>{$detalle.metadatos?.tiempo_estimado || 'desconocido'}</dd>
              <dt>Peso est.</dt>
              <dd>{$detalle.metadatos?.peso_estimado || 'desconocido'}</dd>
            </dl>
          {:else}
            <div class="vacio">no se pudo cargar el detalle</div>
          {/if}
          <div class="panel-gestos">
            <button class="btn-neutro" on:click={cerrarDetalle}>cerrar</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  {#if tabActiva === 'trabajador'}
    <!-- CARA DEL TRABAJADOR (LECTOR casi puro): ficha + cinta + categorías. SIN escritura. -->
    <div class="trabajador-vista">
      <div class="worker-toolbar">
        <span class="pulso worker-pulso">🖨️ {$totalModelos} piezas disponibles</span>
        <span class="worker-hint">toca una pieza para ver su ficha de impresión · el trabajador no registra</span>
        <label class="worker-filtro">
          <span class="worker-filtro-label">🏷️</span>
          <select class="input" bind:value={filtroCategoria} title="ordenar la cinta por categoría (categorias)">
            <option value="">todas las categorías</option>
            {#each $categorias as c (c)}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </label>
      </div>

      <!-- CINTA OPERATIVA "qué hay disponible" (listar), agrupable por categoría (categorias) -->
      {#if $catalogoLoading && modelosWorker.length === 0}
        <div class="vacio">cargando piezas…</div>
      {:else if modelosWorker.length === 0}
        <div class="vacio">
          <div class="vacio-ico">🧊</div>
          <div class="vacio-txt">no hay piezas disponibles{filtroCategoria ? ` en «${filtroCategoria}»` : ''} — pide al jefe que registre un modelo</div>
        </div>
      {:else}
        <div class="cinta worker-cinta">
          <div class="cinta-head">
            <span class="th th-nombre">Pieza</span>
            <span class="th th-cat">Categoría</span>
            <span class="th th-origen">Origen</span>
          </div>
          {#each modelosWorker as fila (fila.id)}
            <article
              class="fila worker-fila"
              class:activa={filaWorker?.id === fila.id}
              role="button"
              tabindex="0"
              on:click={() => abrirFichaTrabajador(fila)}
              on:keydown={(e) => e.key === 'Enter' && abrirFichaTrabajador(fila)}
            >
              <span class="td td-nombre">
                <span class="td-ico">🖨️</span>
                <span class="td-valor">{fila.nombre}</span>
              </span>
              <span class="td td-cat">
                <span class="chip-cat">{categoriaLabel(fila.categoria)}</span>
              </span>
              <span class="td td-origen">{origenLabel(fila.origen)}</span>
            </article>
          {/each}
        </div>
      {/if}

      <!-- FICHA de impresión (obtener) — gesto rey del trabajador; inline, sin escritura -->
      {#if filaWorker}
        <div class="ficha-trabajador">
          <h4 class="ficha-titulo">🖨️ Ficha de impresión — {filaWorker.nombre}</h4>
          {#if $detalleLoading}
            <div class="vacio">cargando ficha…</div>
          {:else if $detalle && $detalle.id === filaWorker.id}
            <div class="ficha-nota">lo que cargas al printer antes de tirar la pieza</div>
            <dl class="ficha-grid">
              <dt>Archivo .3mf</dt>
              <dd><code>{$detalle.archivo3mf || 'desconocido'}</code></dd>
              <dt>Material</dt>
              <dd>{$detalle.metadatos?.material || 'desconocido'}</dd>
              <dt>Dimensiones</dt>
              <dd>{$detalle.metadatos?.dimensiones || 'desconocido'}</dd>
              <dt>Tiempo est.</dt>
              <dd>{$detalle.metadatos?.tiempo_estimado || 'desconocido'}</dd>
              <dt>Peso est.</dt>
              <dd>{$detalle.metadatos?.peso_estimado || 'desconocido'}</dd>
              <dt>Origen</dt>
              <dd>{origenLabel($detalle.origen)}</dd>
              <dt>Categoría</dt>
              <dd><span class="chip-cat">{categoriaLabel($detalle.categoria)}</span></dd>
            </dl>
          {:else}
            <div class="vacio">selecciona una pieza de la cinta para ver su ficha</div>
          {/if}
        </div>
      {/if}

      <div class="pie-hint">operación física (retirar, filamento) vive en ciclo-impresión · aquí solo se consulta la ficha</div>
    </div>
  {/if}
</div>

<style>
  .catalogo-panel {
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
  .cinta-error { font-size: 0.75rem; color: #ef4444; padding: 0.3rem 0.7rem; }

  /* ---- pestañas (UN panel, dos caras) ---- */
  .tabs {
    display: flex;
    gap: 0.3rem;
    padding: 0.25rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05rem;
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-text-muted, #888);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
  }
  .tab:hover { color: inherit; }
  .tab.activo {
    color: #111;
    background: var(--color-primary, #eab308);
  }
  .tab-sub { font-size: 0.6rem; font-weight: 500; opacity: 0.75; }

  .cabecera {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .pulso {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.12);
  }
  .pulso-cats {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.75rem;
    color: #a3a3a3;
    background: rgba(163, 163, 163, 0.12);
  }
  .btn-jefe, .btn-neutro {
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .btn-jefe { background: var(--color-primary, #eab308); color: #111; font-weight: 700; }
  .btn-jefe:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-neutro { background: transparent; color: inherit; border-color: var(--color-border, #444); }
  .senal-confirmacion {
    font-size: 0.72rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 140px;
    border: 1px dashed var(--color-border, #444);
    border-radius: 8px;
    color: var(--color-text-muted, #888);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .vacio-ico { font-size: 2rem; }
  .vacio-txt { text-align: center; }
  .cinta { display: flex; flex-direction: column; gap: 0.3rem; }
  .cinta-head, .fila {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 180px 140px;
    gap: 0.5rem;
    align-items: center;
    padding: 0.45rem 0.7rem;
    font-size: 0.78rem;
  }
  .cinta-head { color: var(--color-text-muted, #888); text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.04em; }
  .th { font-weight: 600; }
  .fila {
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .fila:hover { border-color: var(--color-primary, #eab308); }
  .fila.activa { border-color: #22c55e; }
  .td { display: inline-flex; align-items: center; gap: 0.4rem; }
  .td-ico { opacity: 0.7; }
  .td-valor { font-weight: 600; }
  .chip-cat {
    font-size: 0.68rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgba(163, 163, 163, 0.14);
    color: inherit;
  }
  .pie-hint { font-size: 0.62rem; color: var(--color-text-muted, #888); padding: 0 0.2rem; }

  /* ---- cara del TRABAJADOR (consulta operativa, LECTOR) ---- */
  .trabajador-vista { display: flex; flex-direction: column; gap: 0.6rem; }
  .worker-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
  }
  .worker-pulso { color: #22c55e; background: rgba(34, 197, 94, 0.12); }
  .worker-hint { flex: 1; min-width: 160px; font-size: 0.66rem; color: var(--color-text-muted, #888); }
  .worker-filtro { display: inline-flex; align-items: center; gap: 0.3rem; }
  .worker-filtro-label { font-size: 0.75rem; opacity: 0.8; }
  .worker-filtro select { width: 190px; }
  .worker-cinta .fila { border-color: rgba(34, 197, 94, 0.25); }
  .worker-cinta .fila:hover { border-color: #22c55e; }
  .ficha-trabajador {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.8rem 1rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid rgba(34, 197, 94, 0.35);
    border-radius: 8px;
  }
  .ficha-titulo { margin: 0; font-size: 0.9rem; color:#22c55e; }
  .ficha-nota { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .ficha-grid {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.4rem 0.8rem;
    font-size: 0.8rem;
    margin: 0;
  }
  .ficha-grid dt { color: var(--color-text-muted, #888); }
  .ficha-grid dd { margin: 0; }
  .ficha-grid code { font-size: 0.74rem; background: var(--color-surface, #1a1a1a); padding: 0.1rem 0.35rem; border-radius: 4px; }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .panel {
    width: min(92vw, 460px);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--color-bg, #141414);
    border: 1px solid var(--color-border, #444);
    border-radius: 10px;
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .panel-detalle { width: min(92vw, 420px); }
  .panel-titulo { margin: 0; font-size: 1rem; }
  .err-panel { font-size: 0.75rem; color: #ef4444; }
  .campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.74rem; color: var(--color-text-muted, #aaa); }
  .campo em { font-style: normal; color: #f59e0b; }
  .input {
    background: var(--color-surface, #1a1a1a);
    color: inherit;
    border: 1px solid var(--color-border, #444);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .grupo-metadatos {
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
  }
  .grupo-metadatos legend { font-size: 0.72rem; color: var(--color-text-muted, #888); padding: 0 0.3rem; }
  .muted { font-size: 0.65rem; color: var(--color-text-muted, #888); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .panel-gestos { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .detalle-campos { display: grid; grid-template-columns: 120px 1fr; gap: 0.4rem 0.8rem; font-size: 0.8rem; margin: 0; }
  .detalle-campos dt { color: var(--color-text-muted, #888); }
  .detalle-campos dd { margin: 0; }
  .detalle-campos code { font-size: 0.74rem; background: var(--color-surface, #1a1a1a); padding: 0.1rem 0.35rem; border-radius: 4px; }
</style>
