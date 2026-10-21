<script lang="ts">
  /**
   * CartaManagerJefePanel — la cara del JEFE sobre el custodio de cartas (F7).
   * Capas (esquema-jefe/carta-manager):
   *   1. CINTA — n borrador · n en_servicio · n archivada (list/stats, señal-refresh).
   *   2. SELECCIÓN — ref-select de cartas por estado + detalle (get).
   *   3. TRANSICIONES NOMBRADAS — activar (confirmador nombrado, FREÑO previo),
   *      clonar (default '<nombre> (copia)'), archivar, versiones (restaurar vN).
   *   4. ALTA DE PRODUCTO — editor-bloque {nombre, precio €, categoria_id
   *      (ref-select de la carta), ingredientes_base json opcional}.
   *      409→'ya existe (id determinista)' · 412→'crea antes la categoría'.
   *   5. FREÑO — botón validar → dictamen {valid, errors[]} ANTES de activar:
   *      ¡activar queda BLOQUEADO si !valid!
   * Canal: cartaRpc → 'core/' + ASTERISCO LITERAL + '/events/carta/<op>/request'.
   */
  import { onMount, tick } from 'svelte';
  import {
    sortedCartas,
    cinta,
    cartasCargando,
    cartasError,
    cartaSeleccionada,
    versiones,
    dictamen,
    errorMutacion,
    listarCartas,
    obtenerCarta,
    pedirVersiones,
    validarCarta,
    activarCarta,
    clonarCarta,
    archivarCarta,
    restaurarVersion,
    añadirProducto,
    formatearEuros,
    parsearEuros,
    describeError,
    initCartaJefeSubscriptions,
    type CartaJefe,
    type CartaVersionResumen
  } from './stores/carta-jefe';

  // --- estado local del panel -------------------------------------------------
  let cartaIdElegida: string = '';
  let mostrarVersiones = false;

  // --- alta de producto (editor-bloque) ---------------------------------------
  let prodNombre = '';
  let prodPrecioTexto = '';
  let prodCategoriaId = '';
  let prodIngredientesJson = '';
  let altaError: string | null = null;
  let altaOk: string | null = null;

  // --- clonar -----------------------------------------------------------------
  let clonarNombre = '';
  let clonarError: string | null = null;

  // --- confirmadores nombrados (R4) -------------------------------------------
  type Confirmacion = { titulo: string; mensaje: string; accion: () => Promise<void> } | null;
  let confirmacion: Confirmacion = null;
  let versionARestaurar: CartaVersionResumen | null = null;

  // --- derivados ---------------------------------------------------------------
  $: carta = $cartaSeleccionada;
  $: categorias = (carta?.categorias ?? []) as Array<{ id?: string; nombre?: string }>;
  $: productos = (carta?.productos ?? []) as Array<{
    id?: string;
    nombre?: string;
    precio?: number;
    categoria_id?: string;
  }>;
  $: freñoBloquea = $dictamen !== null && $dictamen.valid === false;
  $: if (cartaIdElegida) void refrescarDetalle(cartaIdElegida);

  // La señal re-lista el catálogo; si la elegida sigue existiendo, re-detalle.
  onMount(() => {
    void listarCartas();
    const cleanup = initCartaJefeSubscriptions();
    return () => {
      cleanup();
    };
  });

  async function refrescarDetalle(id: string): Promise<void> {
    await obtenerCarta(id);
    if (mostrarVersiones) void pedirVersiones(id);
  }

  function elegirCarta(ev: Event): void {
    const id = (ev.currentTarget as HTMLSelectElement).value;
    cartaIdElegida = id;
    versiones.set([]); // (store import: setter directo de writable export)
    mostrarVersiones = false;
    $dictamen = null;
    clonarNombre = '';
    if (id) {
      const c = $sortedCartas.find((x) => x.id === id);
      clonarNombre = c ? `${c.nombre} (copia)` : '';
    }
  }

  // --- FREÑO -------------------------------------------------------------------
  async function pedirDictamen(): Promise<void> {
    if (!cartaIdElegida) return;
    altaError = null;
    await validarCarta(cartaIdElegida);
  }

  // --- transiciones (todas con confirmador nombrado) ---------------------------
  function pedirActivar(): void {
    if (!carta) return;
    confirmacion = {
      titulo: 'ACTIVAR',
      mensaje: `activa AHORA '${carta.nombre}' — degrada la activa y cambia el catálogo vivo`,
      accion: async () => {
        await activarCarta(carta.id);
      }
    };
  }

  function pedirClonar(): void {
    if (!carta) return;
    const nombre = clonarNombre.trim() || `${carta.nombre} (copia)`;
    confirmacion = {
      titulo: 'CLONAR',
      mensaje: `crea '${nombre}' como copia de '${carta.nombre}' (id carta_<slug>)`,
      accion: async () => {
        try {
          await clonarCarta(carta.id, nombre);
          clonarError = null;
        } catch (err) {
          clonarError = describeError(err);
        }
      }
    };
  }

  function pedirArchivar(): void {
    if (!carta) return;
    confirmacion = {
      titulo: 'ARCHIVAR',
      mensaje: `archiva '${carta.nombre}' (delete suave: estado → archivada, no se borra)`,
      accion: async () => {
        await archivarCarta(carta.id);
      }
    };
  }

  function pedirRestaurar(v: CartaVersionResumen): void {
    if (!carta) return;
    versionARestaurar = null;
    confirmacion = {
      titulo: 'RESTAURAR',
      mensaje: `restaura '${carta.nombre}' a la versión ${v.timestamp} (snapshot ${v.filename})`,
      accion: async () => {
        await restaurarVersion(carta.id, v.filename);
      }
    };
  }

  async function confirmar(): Promise<void> {
    if (!confirmacion) return;
    const c = confirmacion;
    confirmacion = null;
    try {
      await c.accion();
      await tick();
      await obtenerCarta(cartaIdElegida); // eco fresco post-mutación
    } catch (err) {
      altaError = describeError(err);
    }
  }

  // --- ALTA DE PRODUCTO --------------------------------------------------------
  async function darAltaProducto(): Promise<void> {
    altaError = null;
    altaOk = null;
    if (!carta) {
      altaError = 'elige antes la carta';
      return;
    }
    const nombre = prodNombre.trim();
    const precio = parsearEuros(prodPrecioTexto);
    if (!nombre) {
      altaError = 'nombre obligatorio';
      return;
    }
    if (precio === null) {
      altaError = 'precio € obligatorio (número ≥ 0)';
      return;
    }
    if (!prodCategoriaId) {
      altaError = 'crea antes la categoría';
      return;
    }
    let ingredientesBase: unknown = undefined;
    const jsonCrudo = prodIngredientesJson.trim();
    if (jsonCrudo) {
      try {
        ingredientesBase = JSON.parse(jsonCrudo);
      } catch {
        altaError = 'ingredientes_base: JSON inválido';
        return;
      }
    }
    try {
      await añadirProducto(carta.id, {
        nombre,
        precio, // EUROS — el custodio redondea a 2dec
        categoria_id: prodCategoriaId,
        ...(ingredientesBase !== undefined ? { ingredientes_base: ingredientesBase } : {})
      });
      altaOk = `dada de alta: ${nombre} · ${formatearEuros(precio)} (señal carta.editada en camino)`;
      prodNombre = '';
      prodPrecioTexto = '';
      prodIngredientesJson = '';
    } catch (err) {
      altaError = describeError(err); // 409 → 'ya existe (id determinista)' · 412 → 'crea antes la categoría'
    }
  }

  const colorEstado = (estado?: string): string =>
    estado === 'en_servicio' ? '#16a34a' : estado === 'archivada' ? '#dc2626' : '#2563eb';
</script>

<div class="jefe">
  <!-- CAPA 1 · CINTA de estados -->
  <div class="cinta" data-testid="cinta-estados">
    <span class="chip borrador">{$cinta.borrador} borrador</span>
    <span class="chip en_servicio">{$cinta.en_servicio} en_servicio</span>
    <span class="chip archivada">{$cinta.archivada} archivada</span>
    <span class="chip total">{$cinta.total} cartas</span>
    {#if $errorMutacion}<span class="error">⚠ {$errorMutacion}</span>{/if}
  </div>

  <!-- CAPA 2 · SELECCIÓN (ref-select por estado real) -->
  <label class="seleccion">
    <span>Carta</span>
    <select bind:value={cartaIdElegida} disabled={$cartasCargando}>
      <option value="" disabled selected>elige una carta…</option>
      {#each $sortedCartas as c (c.id)}
        <option value={c.id}>{c.nombre} — {c.estado || 'borrador'} (v{c.version ?? 1})</option>
      {/each}
    </select>
  </label>
  {#if $cartasError}<p class="error">{$cartasError}</p>{/if}

  {#if carta}
    <!-- CAPA 3 · TRANSICIONES NOMBRADAS -->
    <section class="transiciones">
      <h3>{carta.nombre} <span class="estado" style="background:{colorEstado(carta.estado)}">{carta.estado || 'borrador'}</span></h3>

      <div class="botones">
        <button class="activar" onclick={pedirActivar} disabled={$dictamen !== null && !$dictamen.valid}
          title={$dictamen && !$dictamen.valid ? 'bloqueado: el freño validar dictaminó !valid' : 'activa esta carta'}>
          ⚡ Activar
        </button>
        <button onclick={pedirClonar}>⧉ Clonar</button>
        <button onclick={pedirArchivar}>🗄 Archivar</button>
        <button onclick={() => (mostrarVersiones = !mostrarVersiones)}>🕓 Versiones</button>
      </div>
      {#if clonarError}<p class="error">{clonarError}</p>{/if}

      <div class="clonar-nombre">
        <label>nombre del clon: <input bind:value={clonarNombre} placeholder="{carta.nombre} (copia)" /></label>
      </div>

      <!-- FREÑO: dictamen antes de activar -->
      <div class="freno">
        <button class="validar" onclick={pedirDictamen}>🛑 Validar (freño)</button>
        {#if $dictamen}
          <div class="dictamen {$dictamen.valid ? 'ok' : 'ko'}" data-testid="dictamen-validar">
            {#if $dictamen.valid}
              ✓ válida — activar desbloqueado
            {:else}
              ✗ inválida — activar BLOQUEADO
              <ul>
                {#each $dictamen.errors as e}
                  <li>{e}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- CAPA 4 · ALTA DE PRODUCTO (editor-bloque) -->
    <section class="alta-producto">
      <h4>Alta de producto</h4>
      <div class="form">
        <label>nombre <input bind:value={prodNombre} placeholder="Pizza Mortadela" /></label>
        <label>precio € <input bind:value={prodPrecioTexto} inputmode="decimal" placeholder="9,50" /></label>
        <label>categoria
          <select bind:value={prodCategoriaId}>
            <option value="" disabled selected>elige categoría…</option>
            {#each categorias as cat (cat.id)}
              <option value={cat.id}>{cat.nombre || cat.id}</option>
            {/each}
          </select>
        </label>
        <label class="json">ingredientes_base (JSON opcional)
          <textarea bind:value={prodIngredientesJson} rows="2" placeholder="{JSON.stringify([{ nombre: 'mortadela' }])}"></textarea>
        </label>
        <button onclick={darAltaProducto}>+ Dar de alta</button>
      </div>
      {#if altaError}<p class="error">{altaError}</p>{/if}
      {#if altaOk}<p class="ok">{altaOk}</p>{/if}
    </section>

    <!-- PRODUCTOS de la carta (lectura) -->
    <section class="productos">
      <h4>Productos ({productos.length})</h4>
      <ul>
        {#each productos as p (p.id)}
          <li>
            <span class="nombre">{p.nombre}</span>
            <span class="precio">{formatearEuros(p.precio)}</span>
            <span class="cat">{p.categoria_id || ''}</span>
          </li>
        {:else}
          <li class="vacio">sin productos</li>
        {/each}
      </ul>
    </section>

    <!-- VERSIONES (lista desc + restaurar vN) -->
    {#if mostrarVersiones}
      <section class="versiones">
        <h4>Versiones</h4>
        <button class="mini" onclick={() => void pedirVersiones(carta.id)}>recargar</button>
        <ul>
          {#each $versiones as v (v.filename)}
            <li>
              <span class="ts">{v.timestamp}</span>
              <button class="mini" onclick={() => void pedirRestaurar(v)}>[restaurar v{v.timestamp}]</button>
            </li>
          {:else}
            <li class="vacio">sin versiones</li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <p class="vacio">elige una carta para gobernarla</p>
  {/if}
</div>

<!-- CONFIRMADOR NOMBRADO (R4): dice EXACTAMENTE qué va a pasar -->
{#if confirmacion}
  <div class="confirmador-overlay" role="dialog" aria-label={confirmacion.titulo}>
    <div class="confirmador">
      <h4>{confirmacion.titulo}</h4>
      <p>{confirmacion.mensaje}</p>
      <div class="acciones">
        <button class="peligro" onclick={() => void confirmar()}>Confirmar</button>
        <button onclick={() => (confirmacion = null)}>Cancelar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .jefe { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
  .cinta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .chip { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; }
  .chip.borrador { background: #2563eb; }
  .chip.en_servicio { background: #16a34a; }
  .chip.archivada { background: #dc2626; }
  .chip.total { background: #475569; }
  .seleccion { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .seleccion select { flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid #cbd5e1; }
  h3 { margin: 0; font-size: 16px; display: flex; gap: 8px; align-items: center; }
  .estado { font-size: 11px; color: #fff; padding: 2px 8px; border-radius: 999px; }
  h4 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .botones { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  button { padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 13px; }
  button.activar { background: #16a34a; color: #fff; border-color: #15803d; font-weight: 700; }
  button.activar:disabled { background: #94a3b8; border-color: #64748b; cursor: not-allowed; }
  button.validar { border-color: #b91c1c; color: #b91c1c; font-weight: 700; }
  button.peligro { background: #dc2626; color: #fff; border-color: #b91c1c; }
  button.mini { padding: 2px 6px; font-size: 11px; }
  .clonar-nombre label { font-size: 12px; color: #475569; display: flex; gap: 6px; align-items: center; }
  .clonar-nombre input { flex: 1; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
  .freno { display: flex; flex-direction: column; gap: 6px; }
  .dictamen { font-size: 13px; padding: 8px; border-radius: 6px; }
  .dictamen.ok { background: #dcfce7; color: #166534; }
  .dictamen.ko { background: #fee2e2; color: #991b1b; }
  .dictamen ul { margin: 6px 0 0 16px; padding: 0; }
  .form { display: flex; flex-direction: column; gap: 8px; }
  .form label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #475569; }
  .form input, .form select, .form textarea { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
  .form > button { align-self: flex-start; background: #1d4ed8; color: #fff; border-color: #1e40af; font-weight: 600; }
  .productos ul, .versiones ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .productos li { display: flex; gap: 10px; font-size: 13px; align-items: baseline; }
  .productos .nombre { font-weight: 600; }
  .productos .precio { margin-left: auto; font-variant-numeric: tabular-nums; }
  .productos .cat { font-size: 11px; color: #64748b; }
  .versiones li { display: flex; gap: 8px; font-size: 12px; align-items: center; }
  .versiones .ts { font-family: monospace; }
  .error { color: #b91c1c; font-size: 12px; margin: 4px 0; }
  .ok { color: #166534; font-size: 12px; margin: 4px 0; }
  .vacio { color: #64748b; font-size: 13px; font-style: italic; }
  .confirmador-overlay {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .confirmador { background: #fff; border-radius: 10px; padding: 16px; max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
  .confirmador h4 { margin: 0 0 8px; font-size: 14px; }
  .confirmador p { font-size: 14px; margin: 0 0 12px; }
  .confirmador .acciones { display: flex; gap: 8px; justify-content: flex-end; }
</style>