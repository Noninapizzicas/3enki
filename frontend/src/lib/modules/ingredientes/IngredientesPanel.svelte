<script lang="ts">
  /**
   * IngredientesPanel — LA CARA DEL JEFE del catálogo de ingredientes (F7).
   * Reescribe el panel de otra generación (Browser/Card/Detail siguen en el
   * dir, este panel ya no los importa): precio inline + editor de LOTE.
   *
   * El catálogo de ingredientes es FUENTE ÚNICA de precio_extra: los extras que
   * variaciones declara sin precio caen aquí y el motor-opciones LEE este valor
   * al vender. Editar aquí = regar la venta (invariante INV1 del esquema-jefe).
   *
   * Composición 3 capas (esquema-jefe de ingredientes):
   *   - CAPA 1-2 (SELECCIONAR/INFORMARSE): ref-select de GRUPO (derivado de la
   *     propia lista) + búsqueda local + cinta-estado "n ingredientes · n grupos
   *     · n con precio · n alérgenos".
   *   - CAPA 3 (DECLARAR, ROL JEFE):
   *     · H1 inline-gesture: la cifra € de la ficha es toque→input→Enter con eco
   *       del anterior → update { id, precio_extra } (1× señal).
   *     · H2 editor-bloque: ficha completa (nombre, familia, alérgenos) →
   *       update { id, ...cambios } (1× señal).
   *     · H3 editor de LOTE: tabla del alcance (grupo o todo) editable en columna
   *       precio → update_precios UNA llamada { grupo?, precio_extra | porcentaje }.
   *       CONTRATO REAL: el handler NO acepta [{id,precio}...] — el lote es una
   *       cifra (fija o %) para el alcance; el dictamen vuelve por RPC
   *       (actualizados[]{nombre,anterior,nuevo}) y N señales re-leen la lista.
   *
   * Moneda (R6, verificado en index.js L472): el motor persiste EUROS float
   * redondeado a 2 decimales — aquí se edita y envía €. SIN conversión céntimos.
   *
   * Señal manda (R3): suscripción a ingrediente.actualizado (1× update · N×
   * lote, debounce 60ms) + ingrediente.creado + carta.actualizada (re-siembra)
   * → re-lee list. Nunca recarga, nunca estado optimista.
   *
   * Patrón del repo: PedidosPanel (estación del jefe) — mqttRequest + señales
   * dot-notation + error nombrado en su tarjeta.
   */

  import { onMount } from 'svelte';
  import {
    ingredientes,
    grupos,
    cinta,
    mutacionesPendientes,
    errorMutacion,
    loadCatalogo,
    loadCatalogoDeGrupo,
    cargarAlergenos,
    pulsoAlergenos,
    resetIngredientes,
    initIngredientesSubscriptions,
    actualizarPrecio,
    actualizarFicha,
    actualizarPreciosLote,
    formatearEuros,
    parsearEuros,
    describeError,
    type Ingrediente,
    type PrecioLoteFila
  } from './stores/ingredientes';
  import { sessionProjectId } from '$lib/stores/sessionProject';

  export let panelId: string = '';

  // ---- CAPA 1: ref-select de grupo + búsqueda local ----
  let grupoSel = ''; // '' = todos los grupos
  let busqueda = '';

  /** Alcance del lote seleccionado en ese momento ('' = todo el catálogo). */
  let alcanceLote = '';

  /** Filtro local por búsqueda sobre el catálogo ya leído (list trae la ficha). */
  $: visibles = $ingredientes.filter((i) => {
    if (grupoSel && !(i.grupos || []).includes(grupoSel)) return false;
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return i.nombre.toLowerCase().includes(q) || (i.familia || '').toLowerCase().includes(q);
  });

  /** Grupos con su conteo sobre la lista completa (para el ref-select). */
  $: gruposConConteo = $grupos.map((g) => ({
    g,
    n: $ingredientes.filter((i) => (i.grupos || []).includes(g)).length
  }));

  // ---- H1 · precio inline por ficha ----
  /** id cuyo precio está en edición + texto del input + error nombrado en su ficha. */
  let editPrecioId: string | null = null;
  let editPrecioTexto = '';
  let erroresPorFicha: Record<string, string> = {};
  let busyPrecioId: string | null = null;

  function abrirPrecioInline(ing: Ingrediente): void {
    editPrecioId = ing.id;
    editPrecioTexto = ing.precio_extra != null ? String(ing.precio_extra).replace('.', ',') : '0';
    delete erroresPorFicha[ing.id];
    erroresPorFicha = { ...erroresPorFicha };
  }

  function cerrarPrecioInline(): void {
    editPrecioId = null;
    editPrecioTexto = '';
  }

  async function confirmarPrecioInline(ing: Ingrediente): Promise<void> {
    const euros = parsearEuros(editPrecioTexto);
    if (euros === null) {
      erroresPorFicha = { ...erroresPorFicha, [ing.id]: 'cifra no válida (usa €, ej. 0,50)' };
      return;
    }
    busyPrecioId = ing.id;
    try {
      await actualizarPrecio(ing.id, euros); // señal 1× re-lee la lista (R3)
      cerrarPrecioInline();
    } catch (err) {
      erroresPorFicha = { ...erroresPorFicha, [ing.id]: describeError(err) };
    } finally {
      busyPrecioId = null;
    }
  }

  // ---- H2 · editor-bloque de ficha ----
  let fichaAbierta: string | null = null;
  let fichaNombre = '';
  let fichaFamilia = '';
  let fichaEsAlergeno = false;
  let fichaAlergenosTexto = '';
  let fichaBusy = false;
  let fichaError: string | null = null;

  /** Chips sugeridos: tipos de alérgeno ya usados en el catálogo (op alergenos). */
  $: chipsAlergenos = Object.keys($pulsoAlergenos?.por_tipo ?? {});

  function abrirFicha(ing: Ingrediente): void {
    fichaAbierta = ing.id;
    fichaNombre = ing.nombre ?? '';
    fichaFamilia = ing.familia ?? ing.tipo ?? '';
    fichaEsAlergeno = ing.es_alergeno === true;
    fichaAlergenosTexto = (ing.alergenos || []).join(', ');
    fichaError = null;
  }

  function cerrarFicha(): void {
    fichaAbierta = null;
    fichaError = null;
  }

  async function confirmarFicha(ing: Ingrediente): Promise<void> {
    fichaBusy = true;
    fichaError = null;
    const cambios: { nombre?: string; familia?: string; es_alergeno?: boolean; alergenos?: string[] } = {};
    const alergenosLista = fichaAlergenosTexto
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (fichaNombre.trim() && fichaNombre.trim() !== ing.nombre) cambios.nombre = fichaNombre.trim();
    if (fichaFamilia.trim() !== (ing.familia ?? ing.tipo ?? '')) cambios.familia = fichaFamilia.trim();
    if (fichaEsAlergeno !== (ing.es_alergeno === true)) cambios.es_alergeno = fichaEsAlergeno;
    if (JSON.stringify(alergenosLista) !== JSON.stringify(ing.alergenos || [])) cambios.alergenos = alergenosLista;
    try {
      if (Object.keys(cambios).length > 0) await actualizarFicha(ing.id, cambios); // señal 1× (R3)
      cerrarFicha();
    } catch (err) {
      fichaError = describeError(err);
    } finally {
      fichaBusy = false;
    }
  }

  // ---- H3 · editor de LOTE (update_precios en UNA llamada) ----
  let loteAbierto = false;
  /** Modo del lote: cifra fija para el alcance, o % compuesto sobre el vigente. */
  let loteModo: 'fijo' | 'porcentaje' = 'fijo';
  let loteValorTexto = '';
  let loteBusy = false;
  let loteError: string | null = null;
  /** Dictamen: filas {nombre, anterior, nuevo} devueltas por la llamada. */
  let loteDictamen: PrecioLoteFila[] = [];

  $: alcanceLabel = alcanceLote === '' ? `todo el catálogo (${visibles.length} ingredientes)` : `grupo "${alcanceLote}"`;

  function abrirLote(): void {
    loteAbierto = true;
    loteModo = 'fijo';
    loteValorTexto = '';
    loteError = null;
    loteDictamen = [];
  }

  function cerrarLote(): void {
    loteAbierto = false;
    loteDictamen = [];
  }

  /** El jefe apunta precio a precio en la tabla; Enter aplaza al botón del lote. */
  async function ejecutarLote(): Promise<void> {
    const txt = loteValorTexto.trim();
    if (!txt) return;
    loteBusy = true;
    loteError = null;
    try {
      if (loteModo === 'porcentaje') {
        const pct = Number(txt.replace(',', '.'));
        if (!Number.isFinite(pct)) {
          loteError = 'porcentaje no válido (ej. 5 o -10)';
          return;
        }
        // COMPUESTO sobre el precio vigente de cada ingrediente (index.js L472).
        const filas = await actualizarPreciosLote({
          ...(alcanceLote ? { grupo: alcanceLote } : {}),
          porcentaje: pct
        });
        loteDictamen = filas;
      } else {
        const euros = parsearEuros(txt);
        if (euros === null) {
          loteError = 'cifra no válida (usa €, ej. 0,60)';
          return;
        }
        const filas = await actualizarPreciosLote({
          ...(alcanceLote ? { grupo: alcanceLote } : {}),
          precio_extra: euros
        });
        loteDictamen = filas;
      }
      loteValorTexto = '';
    } catch (err) {
      loteError = describeError(err);
    } finally {
      loteBusy = false;
    }
  }

  // ---- ciclo de vida + señales (R3) ----
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initIngredientesSubscriptions();
    void cargarAlergenos();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetIngredientes();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $sessionProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      void loadCatalogo();
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetIngredientes();
    }
  }

  /** Cambia el grupo del ref-select: lectura dirigida (repuebla catálogo local). */
  function elegirGrupo(e: Event): void {
    const v = (e.currentTarget as HTMLSelectElement).value;
    grupoSel = v;
    if (v === '') {
      void loadCatalogo();
    } else {
      void loadCatalogoDeGrupo(v);
    }
  }

  /** Eco legible del precio anterior durante la edición inline. */
  function ecoAnterior(ing: Ingrediente): string {
    return formatearEuros(ing.precio_extra ?? 0);
  }
</script>

<div class="jefe-ingredientes" data-ingredientes-panel={panelId}>
  <div class="actor-badge">
    <span class="badge-icon">CEO</span>
    <span class="badge-label">Vista Jefe</span>
    <span class="badge-scope">catálogo de ingredientes · fuente única de precio_extra (alimenta los extras del POS)</span>
    {#if $mutacionesPendientes > 0}
      <span class="badge-sync">sincronizando…</span>
    {/if}
  </div>

  {#if $errorMutacion}
    <div class="cinta-error">{$errorMutacion}</div>
  {/if}

  <!-- CAPA 1-2 · cinta-estado: el pulso sin navegar -->
  <div class="cinta-estado">
    <span class="pulso">{$cinta.total} ingredientes</span>
    <span class="pulso">{$cinta.grupos} grupos</span>
    <span class="pulso pulso-precio">{$cinta.conPrecio} con precio extra ({$cinta.conPrecioPct}%)</span>
    <span class="pulso pulso-alerg">{$cinta.alergenos} alérgenos</span>
  </div>

  <!-- CAPA 1 · ref-select de grupo + búsqueda local + editor de lote -->
  <div class="fila-herramientas">
    <select class="ref-select" value={grupoSel} on:change={elegirGrupo} aria-label="Grupo del catálogo">
      <option value="">todos los grupos</option>
      {#each gruposConConteo as { g, n } (g)}
        <option value={g}>{g} ({n})</option>
      {/each}
    </select>
    <input
      class="buscador"
      type="search"
      placeholder="buscar ingrediente…"
      bind:value={busqueda}
    />
    <button class="btn-jefe" on:click={abrirLote}>Ajustar precios en LOTE</button>
  </div>

  <!-- CAPA 2-3 · tarjetas-ficha con precio inline -->
  {#if !$sessionProjectId}
    <div class="vacio">sin proyecto activo</div>
  {:else if $cinta.total === 0}
    <div class="vacio">catálogo vacío</div>
  {:else if visibles.length === 0}
    <div class="vacio">
      {#if grupoSel}sin ingredientes en "{grupoSel}"{:else}nada coincide con la búsqueda{/if}
    </div>
  {:else}
    <div class="lista-fichas">
      {#each visibles as ing (ing.id)}
        <article class="ficha" class:ficha-alergeno={ing.es_alergeno}>
          <header>
            <span class="nombre">{ing.emoji ? ing.emoji + ' ' : ''}{ing.nombre}</span>
            {#if ing.es_alergeno}<span class="chip-alerg" title="alérgeno declarado">alérgeno</span>{/if}
          </header>
          <div class="meta">
            <span class="grupo-tag">{(ing.grupos || []).join(' · ') || 'sin grupo'}</span>
            <span class="familia">{ing.familia || ing.tipo || ''}</span>
          </div>

          <!-- H1 · inline-gesture: cifra € editable con eco del anterior -->
          <div class="precio-zona">
            {#if editPrecioId === ing.id}
              <span class="eco">antes {ecoAnterior(ing)}</span>
              <input
                class="precio-input"
                type="text"
                inputmode="decimal"
                bind:value={editPrecioTexto}
                on:keydown={(e) => {
                  if (e.key === 'Enter') void confirmarPrecioInline(ing);
                  if (e.key === 'Escape') cerrarPrecioInline();
                }}
              />
              <button
                class="btn-jefe btn-mini"
                disabled={busyPrecioId === ing.id}
                on:click={() => void confirmarPrecioInline(ing)}>Enter</button
              >
              <button class="btn-neutro btn-mini" on:click={cerrarPrecioInline}>✕</button>
            {:else}
              <button
                class="precio-mostrado"
                title="editar precio (inline) — se guarda en € y alimenta los extras del POS"
                on:click={() => abrirPrecioInline(ing)}
              >
                {formatearEuros(ing.precio_extra ?? 0)}
              </button>
            {/if}
          </div>

          {#if erroresPorFicha[ing.id]}
            <div class="err-ficha">{erroresPorFicha[ing.id]}</div>
          {/if}

          <div class="gestos-ficha">
            <button class="btn-neutro btn-mini" on:click={() => abrirFicha(ing)}>editar ficha</button>
          </div>

          {#if fichaAbierta === ing.id}
            <!-- H2 · editor-bloque de ficha -->
            <div class="editor-bloque">
              <h5>ficha de {ing.nombre}</h5>
              <label>
                nombre
                <input bind:value={fichaNombre} disabled={fichaBusy} />
              </label>
              <label>
                familia
                <input bind:value={fichaFamilia} disabled={fichaBusy} placeholder="familia canónica" />
              </label>
              <label class="fila-toggle">
                <input type="checkbox" bind:checked={fichaEsAlergeno} disabled={fichaBusy} />
                es alérgeno
              </label>
              <label>
                alérgenos (separados por coma)
                <input bind:value={fichaAlergenosTexto} disabled={fichaBusy} placeholder="gluten, lácteos…" />
              </label>
              {#if chipsAlergenos.length > 0}
                <div class="chips">
                  {#each chipsAlergenos as chip (chip)}
                    <button
                      class="chip"
                      title="añadir al campo alérgenos"
                      on:click={() => (fichaAlergenosTexto = fichaAlergenosTexto ? fichaAlergenosTexto + ', ' + chip : chip)}
                    >{chip}</button>
                  {/each}
                </div>
              {/if}
              {#if fichaError}
                <div class="err-ficha">{fichaError}</div>
              {/if}
              <div class="confirm-gestos">
                <button class="btn-jefe" disabled={fichaBusy} on:click={() => void confirmarFicha(ing)}>guardar ficha</button>
                <button class="btn-neutro" on:click={cerrarFicha}>dejarlo estar</button>
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}

  {#if loteAbierto}
    <!-- H3 · editor de LOTE: una llamada update_precios por alcance -->
    <div class="editor-lote" role="dialog" aria-label="Ajustar precios en lote">
      <header>
        <h5>Ajustar precios en LOTE</h5>
        <span class="alcance">{alcanceLabel}</span>
        <button class="btn-neutro btn-mini" on:click={cerrarLote}>cerrar</button>
      </header>

      <div class="lote-gesto">
        <label class="modo">
          <input type="radio" bind:group={loteModo} value="fijo" disabled={loteBusy} />
          precio fijo (€) para todo el alcance
        </label>
        <label class="modo">
          <input type="radio" bind:group={loteModo} value="porcentaje" disabled={loteBusy} />
          porcentaje compuesto sobre el precio vigente de cada uno
        </label>
        <input
          class="lote-input"
          type="text"
          inputmode="decimal"
          placeholder={loteModo === 'fijo' ? '0,60' : '5 o -10'}
          bind:value={loteValorTexto}
          on:keydown={(e) => e.key === 'Enter' && void ejecutarLote()}
        />
        <button class="btn-jefe" disabled={loteBusy || !loteValorTexto.trim()} on:click={() => void ejecutarLote()}>
          {loteModo === 'fijo' ? 'fijar precio al alcance' : 'aplicar % al alcance'}
        </button>
      </div>

      <p class="lote-nota">
        una llamada <code>ingredientes.update_precios {'{'}{alcanceLote ? `grupo: "${alcanceLote}", ` : ''}{loteModo === 'fijo' ? 'precio_extra' : 'porcentaje'}{'}'}</code>
        — el dictamen llega por la señal (una confirmación por ingrediente) y por la respuesta
      </p>

      {#if loteError}
        <div class="err-ficha">{loteError}</div>
      {/if}

      {#if loteDictamen.length > 0}
        <div class="dictamen">
          <h6>dictamen del lote — {loteDictamen.length} ingredientes actualizados</h6>
          <table>
            <thead>
              <tr><th>ingrediente</th><th>antes</th><th>ahora</th></tr>
            </thead>
            <tbody>
              {#each loteDictamen as f (f.id)}
                <tr>
                  <td>{f.nombre}</td>
                  <td class="num">{formatearEuros(f.anterior)}</td>
                  <td class="num">{formatearEuros(f.nuevo)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .jefe-ingredientes {
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
    font-size: 11px;
  }

  .cinta-error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fca5a5;
    border-radius: 6px;
    padding: 0.35rem 0.6rem;
    font-size: 12px;
  }

  /* cinta-estado */
  .cinta-estado {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pulso {
    background: rgba(63, 63, 70, 0.4);
    border: 1px solid rgba(82, 82, 91, 0.5);
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    font-size: 12px;
  }
  .pulso-precio {
    border-color: rgba(250, 204, 21, 0.4);
    color: #fde047;
  }
  .pulso-alerg {
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }

  /* capa 1 */
  .fila-herramientas {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .ref-select,
  .buscador {
    background: rgba(39, 39, 42, 0.8);
    border: 1px solid rgba(82, 82, 91, 0.6);
    border-radius: 6px;
    color: inherit;
    padding: 0.35rem 0.6rem;
    font-size: 13px;
  }
  .buscador {
    flex: 1;
    min-width: 140px;
  }

  .btn-jefe {
    background: rgba(250, 204, 21, 0.15);
    color: #fde047;
    border: 1px solid rgba(250, 204, 21, 0.4);
    border-radius: 6px;
    padding: 0.35rem 0.7rem;
    font-size: 13px;
    cursor: pointer;
  }
  .btn-jefe:hover:not(:disabled) {
    background: rgba(250, 204, 21, 0.25);
  }
  .btn-jefe:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-neutro {
    background: rgba(63, 63, 70, 0.5);
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    border: 1px solid rgba(82, 82, 91, 0.5);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    font-size: 12px;
    cursor: pointer;
  }
  .btn-mini {
    padding: 0.15rem 0.45rem;
    font-size: 11px;
  }

  /* fichas */
  .lista-fichas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.5rem;
  }
  .ficha {
    border: 1px solid rgba(82, 82, 91, 0.5);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: rgba(39, 39, 42, 0.55);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ficha-alergeno {
    border-color: rgba(239, 68, 68, 0.45);
  }
  .ficha header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .nombre {
    font-weight: 600;
  }
  .chip-alerg {
    font-size: 10px;
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .grupo-tag {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .familia {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .precio-zona {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .eco {
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .precio-mostrado {
    font-size: 15px;
    font-weight: 700;
    color: #fde047;
    background: transparent;
    border: 1px dashed rgba(250, 204, 21, 0.45);
    border-radius: 6px;
    padding: 0.15rem 0.5rem;
    cursor: text;
    font-variant-numeric: tabular-nums;
  }
  .precio-mostrado:hover {
    background: rgba(250, 204, 21, 0.08);
  }
  .precio-input {
    width: 90px;
    background: rgba(24, 24, 27, 0.9);
    border: 1px solid rgba(250, 204, 21, 0.5);
    border-radius: 6px;
    color: inherit;
    padding: 0.2rem 0.45rem;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .gestos-ficha {
    display: flex;
    justify-content: flex-end;
  }

  .err-ficha {
    color: #fca5a5;
    font-size: 11px;
  }

  /* H2 · editor-bloque */
  .editor-bloque {
    border-top: 1px dashed rgba(82, 82, 91, 0.6);
    padding-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .editor-bloque h5 {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    text-transform: capitalize;
  }
  .editor-bloque label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .editor-bloque input:not([type]) {
    background: rgba(24, 24, 27, 0.9);
    border: 1px solid rgba(82, 82, 91, 0.6);
    border-radius: 6px;
    color: inherit;
    padding: 0.25rem 0.5rem;
    font-size: 13px;
  }
  .fila-toggle {
    flex-direction: row !important;
    align-items: center;
    gap: 0.4rem !important;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    font-size: 10px;
    border: 1px solid rgba(82, 82, 91, 0.6);
    border-radius: 999px;
    background: rgba(63, 63, 70, 0.4);
    color: inherit;
    padding: 0.05rem 0.4rem;
    cursor: pointer;
  }

  /* H3 · editor de LOTE */
  .editor-lote {
    position: sticky;
    bottom: 0;
    border: 1px solid rgba(250, 204, 21, 0.4);
    background: rgba(24, 24, 27, 0.97);
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .editor-lote header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .editor-lote h5 {
    margin: 0;
    font-size: 13px;
  }
  .alcance {
    font-size: 11px;
    color: #fde047;
    flex: 1;
  }
  .lote-gesto {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }
  .lote-gesto .modo {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .lote-input {
    width: 100px;
    background: rgba(39, 39, 42, 0.9);
    border: 1px solid rgba(250, 204, 21, 0.5);
    border-radius: 6px;
    color: inherit;
    padding: 0.25rem 0.5rem;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .lote-nota {
    margin: 0;
    font-size: 10.5px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
  }
  .lote-nota code {
    font-size: 10px;
    color: #a1a1aa;
  }

  .dictamen table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .dictamen th,
  .dictamen td {
    text-align: left;
    padding: 0.15rem 0.4rem;
    border-bottom: 1px solid rgba(82, 82, 91, 0.35);
  }
  .dictamen th {
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-weight: 500;
  }
  .dictamen .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dictamen h6 {
    margin: 0 0 0.2rem;
    font-size: 11px;
    color: #fde047;
    font-weight: 600;
  }

  .vacio {
    text-align: center;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    padding: 1.2rem 0;
    font-size: 12px;
  }
</style>