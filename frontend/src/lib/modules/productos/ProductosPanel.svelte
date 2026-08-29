<script lang="ts">
  /**
   * ProductosPanel — EL PANEL DEL JEFE de productos (F7, composición según el
   * esquema-jefe y la pasada-4 de formas UI canónicas).
   *
   * Composición 3 capas (SELECCIONAR → INFORMARSE → DECLARAR):
   *   - CINTA-ESTADO (stats via productos.stats) + barra de búsqueda local y select
   *     de categoría (productos list/categorias ya cargados en memoria).
   *   - GRID de tarjetas (ProductoCard): precio inline (gesto rey) + toggle disponible
   *     (1 toque) + acciones que abren editor-bloque (EditorFicha) y confirmador-nombrado
   *     (ConfirmarRetirada).
   *   - DECLARAR: update/delete via productos store (mqttRequest) — NUNCA estado local
   *     asumido (R2). El refresco lo da la señal pareada carta.editada +
   *     catalogo.actualizado (R3) que la store ya suscribe. El precio edita la
   *     CARTA via custodio (R6); disponible (jefe) ≠ activo (estructura) (R4).
   */

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ProductoCard from './ProductoCard.svelte';
  import EditorFicha from './EditorFicha.svelte';
  import ConfirmarRetirada from './ConfirmarRetirada.svelte';
  import {
    productosStore,
    categoriasStore,
    statsStore,
    productosLoading,
    productosError,
    statsError,
    mutacionesPendientes,
    errorMutacion,
    loadProductos,
    loadCinta,
    resetProductos,
    initProductosSubscriptions,
    setPrecio,
    setDisponible,
    guardarFicha,
    eliminarProducto,
    describeError
  } from './stores/productos';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  // ---- filtro local (búsqueda + categoría: cero RPC por tecla) ----
  let busqueda = '';
  let categoriaFiltro = '';

  // ---- formas abiertas ----
  type Producto = { id: string; nombre: string; precio: number; [k: string]: unknown };
  let fichaAbierta: Producto | null = null;
  let fichaError: string | null = null;
  let fichaGuardando = false;
  let retiradaAbierta: Producto | null = null;
  let retiradaError: string | null = null;
  let retiradaGuardando = false;
  /** id de la tarjeta con mutación en vuelo (feedback por tarjeta, no global). */
  let busyId: string | null = null;
  /** Ids con error nombrado en su propia tarjeta (error de turno). */
  let erroresPorTarjeta: Record<string, string> = {};

  /* Suscripción a la señal pareada — R3. */
  let cleanupSenal: (() => void) | null = null;

  onMount(() => {
    cleanupSenal = initProductosSubscriptions();
    return () => {
      if (cleanupSenal) cleanupSenal();
      resetProductos();
    };
  });

  // Reaccionar al proyecto activo: cargar o vaciar (multi-tenant).
  let ultimoProjectId = '';
  $: {
    const pid = $activeProjectId;
    if (typeof pid === 'string' && pid && pid !== ultimoProjectId) {
      ultimoProjectId = pid;
      buscarTodo(pid);
    } else if (!pid && ultimoProjectId) {
      ultimoProjectId = '';
      resetProductos();
    }
  }

  function buscarTodo(projectId: string): void {
    void loadProductos(projectId);
    void loadCinta(projectId);
  }

  // Filtrado en memoria — la búsqueda del esquema (sin RPC por tecla).
  $: productosFiltrados = ($productosStore as Producto[]).filter((p) => {
    if (categoriaFiltro) {
      if (p.categoria_id !== categoriaFiltro && p.categoria !== categoriaFiltro) return false;
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const enNombre = (p.nombre || '').toLowerCase().includes(q);
      const enDesc = ((p.descripcion as string) || '').toLowerCase().includes(q);
      const enEt = (p.etiquetas as string[] | undefined)?.some((t) => t.toLowerCase().includes(q));
      if (!enNombre && !enDesc && !enEt) return false;
    }
    return true;
  });

  $: totalFiltrados = productosFiltrados.length;
  $: totalCatalogo = $statsStore?.total_productos ?? ($productosStore as Producto[]).length;

  function anotarError(id: string, message: string): void {
    erroresPorTarjeta = { ...erroresPorTarjeta, [id]: message };
  }

  function limpiarError(id: string): void {
    const next = { ...erroresPorTarjeta };
    delete next[id];
    erroresPorTarjeta = next;
  }

  // ---- declaraciones (delegan en la store — R2) ----

  async function manejarToggle(id: string, disponible: boolean): Promise<void> {
    const pid = get(activeProjectId);
    if (!pid) return;
    limpiarError(id);
    busyId = id;
    try {
      await setDisponible(pid, id, disponible);
    } catch (err) {
      anotarError(id, describeError(err));
    } finally {
      busyId = null;
    }
  }

  async function manejarPrecioConfirmado(id: string, precio: number): Promise<void> {
    const pid = get(activeProjectId);
    if (!pid) return;
    limpiarError(id);
    busyId = id;
    try {
      await setPrecio(pid, id, precio);
    } catch (err) {
      anotarError(id, describeError(err));
    } finally {
      busyId = null;
    }
  }

  async function manejarGuardarFicha(id: string, campos: Record<string, unknown>): Promise<void> {
    const pid = get(activeProjectId);
    if (!pid) return;
    fichaGuardando = true;
    fichaError = null;
    try {
      await guardarFicha(pid, id, campos);
      fichaAbierta = null; // el feedback lo da la señal refrescando la tarjeta
    } catch (err) {
      fichaError = describeError(err); // el editor-bloque permanece abierto con el error nombrado
    } finally {
      fichaGuardando = false;
    }
  }

  async function manejarDesactivar(id: string): Promise<void> {
    const pid = get(activeProjectId);
    if (!pid) return;
    retiradaGuardando = true;
    retiradaError = null;
    try {
      await setDisponible(pid, id, false);
      retiradaAbierta = null;
    } catch (err) {
      retiradaError = describeError(err);
    } finally {
      retiradaGuardando = false;
    }
  }

  async function manejarBorrar(id: string): Promise<void> {
    const pid = get(activeProjectId);
    if (!pid) return;
    retiradaGuardando = true;
    retiradaError = null;
    try {
      await eliminarProducto(pid, id);
      retiradaAbierta = null;
    } catch (err) {
      retiradaError = describeError(err);
    } finally {
      retiradaGuardando = false;
    }
  }
</script>

<div class="productos-jefe" data-productos-panel={panelId}>
  <!-- ══════════ CINTA-ESTADO ══════════ -->
  <div class="cinta-estado">
    {#if $statsError}
      <span class="cinta-nombre error" title={$statsError}>⚠ cinta no disponible</span>
    {:else if $statsStore && $statsStore.total_productos !== undefined}
      {#if $mutacionesPendientes > 0}
        <span class="sync" aria-live="polite">⏳ sincronizando…</span>
      {/if}
      <span class="cinta-num">{$statsStore.total_productos}</span> productos
      <span class="sep">·</span>
      <span class="cinta-num">{$statsStore.total_categorias ?? '—'}</span> categorías
      <span class="sep">·</span>
      <span class="cinta-num">{$statsStore.productos_con_alergenos ?? '—'}</span> con alérgenos
    {:else if $productosLoading}
      <span class="cinta-nombre muted">cargando catálogo…</span>
    {:else}
      <span class="cinta-nombre muted">sin datos de catálogo</span>
    {/if}
  </div>

  <!-- ══════════ BARRA: búsqueda + categoría ══════════ -->
  <div class="barra">
    <input
      class="busqueda"
      type="search"
      placeholder="Buscar en catálogo… (nombre, descripción, etiqueta)"
      bind:value={busqueda}
    />
    <select class="filtro-categoria" bind:value={categoriaFiltro}>
      <option value="">todas las categorías</option>
      {#each $categoriasStore as cat}
        <option value={cat.id}>
          {cat.nombre}{cat.productos_count !== undefined ? ` (${cat.productos_count})` : ''}
        </option>
      {/each}
    </select>
    <!-- [+ producto] [ABIERTO] — alta vía carta-manager, pendiente de decisión del dueño -->
    <button
      class="btn-plus"
      disabled
      title="Alta vía carta-manager (pendiente de decisión) — el custodio es el escritor del catálogo"
    >
      + producto
    </button>
  </div>

  <!-- ══════════ GRID DE TARJETAS (la vista viva ES el selector) ══════════ -->
  <div class="zona-grid">
    {#if $productosError}
      <div class="estado error" role="alert">⚠ No se pudo leer el catálogo: {$productosError}</div>
    {:else if $productosLoading && totalCatalogo === 0}
      <div class="estado muted">Cargando catálogo…</div>
    {:else if !$productosLoading && totalCatalogo === 0}
      <div class="estado muted">
        La carta activa del proyecto no tiene productos (el alta se gestiona vía carta-manager).
      </div>
    {:else if totalFiltrados === 0}
      <div class="estado muted">Ningún producto coincide con el filtro.</div>
    {:else}
      <div class="grid">
        {#each productosFiltrados as producto (producto.id)}
          <ProductoCard
            {producto}
            busy={busyId === producto.id}
            errorTurno={erroresPorTarjeta[producto.id] ?? null}
            onToggleDisponible={manejarToggle}
            onPrecioConfirmado={manejarPrecioConfirmado}
            onEditarFicha={(p: Producto) => {
              fichaError = null;
              fichaAbierta = p;
            }}
            onRetirar={(p: Producto) => {
              retiradaError = null;
              retiradaAbierta = p;
            }}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Error de mutación de nivel store (fallback si ninguna forma está abierta) -->
  {#if $errorMutacion && !fichaAbierta && !retiradaAbierta}
    <div class="feedback-global" role="alert">⚠ {$errorMutacion}</div>
  {/if}
</div>

{#if fichaAbierta}
  <EditorFicha
    producto={fichaAbierta}
    busy={fichaGuardando}
    errorTurno={fichaError}
    onCerrar={() => (fichaAbierta = null)}
    onGuardar={manejarGuardarFicha}
  />
{/if}

{#if retiradaAbierta}
  <ConfirmarRetirada
    producto={retiradaAbierta}
    busy={retiradaGuardando}
    errorTurno={retiradaError}
    onCerrar={() => (retiradaAbierta = null)}
    onConfirmarDesactivar={manejarDesactivar}
    onConfirmarBorrar={manejarBorrar}
  />
{/if}

<style>
  .productos-jefe {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
    overflow: hidden;
    font-size: 13px;
    color: var(--color-text, #e4e4e7);
  }

  /* cinta-estado */
  .cinta-estado {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    font-size: 0.76rem;
    color: var(--color-text-muted, #888);
  }
  .cinta-num {
    color: var(--color-text, #e4e4e7);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cinta-nombre.muted {
    color: var(--color-text-muted, #888);
  }
  .cinta-nombre.error {
    color: var(--color-error, #ef4444);
  }
  .sep {
    opacity: 0.5;
  }
  .sync {
    color: var(--color-warning, #f59e0b);
    font-size: 0.7rem;
  }

  /* barra */
  .barra {
    display: flex;
    gap: 0.5rem;
  }
  .busqueda {
    flex: 1;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
  }
  .busqueda:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .filtro-categoria {
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 0.4rem 0.5rem;
    font-size: 0.78rem;
    max-width: 13rem;
  }
  .filtro-categoria:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .btn-plus {
    background: none;
    border: 1px dashed var(--color-border, #444);
    color: var(--color-text-muted, #888);
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    font-size: 0.78rem;
    cursor: not-allowed;
  }

  /* grid */
  .zona-grid {
    flex: 1;
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.5rem;
  }
  .estado {
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.8rem;
    border: 1px dashed var(--color-border, #333);
    border-radius: 8px;
  }
  .estado.muted {
    color: var(--color-text-muted, #888);
  }
  .estado.error {
    color: var(--color-error, #ef4444);
    border-color: var(--color-error, #ef4444);
  }

  .feedback-global {
    padding: 0.4rem 0.7rem;
    font-size: 0.74rem;
    color: var(--color-error, #ef4444);
    border-top: 1px solid var(--color-border, #333);
  }
</style>