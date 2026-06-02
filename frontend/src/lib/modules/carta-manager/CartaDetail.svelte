<script lang="ts">
  /**
   * CartaDetail — vista completa de una carta (solo lectura, shape ABIERTO D3).
   * Renderiza meta + categorias + productos segun los campos PRESENTES, sin
   * validar shape ni mostrar banners legacy. Productos en tabla con expansion
   * (Q3=C acordeon): fila compacta + click para ver el resto de campos.
   *
   * Acciones (Postura B): pre-rellenan el chat con la frase canonica (Q5=A).
   * NO hay form de edicion de carta entera (D10). Colores rgb/rgba (frontend.contract).
   */

  import { onMount } from 'svelte';
  import { cartaSeleccionada, getCarta, cartasError } from '$lib/stores/carta-manager';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  export let selectedCartaId: string | null = null;
  export let onVerHistorial: () => void;
  export let onBack: () => void;

  let expandedProductos: Record<string, boolean> = {};
  let showMeta = false;

  onMount(() => {
    if (selectedCartaId) getCarta(selectedCartaId);
  });

  $: carta = $cartaSeleccionada;
  $: error = $cartasError;

  $: estado = carta && typeof carta.estado === 'string' ? (carta.estado as string) : null;
  $: version = carta && typeof carta.version === 'number' ? (carta.version as number) : null;
  $: updatedAt = carta && typeof carta.updated_at === 'string' ? (carta.updated_at as string) : null;
  $: categorias = carta && Array.isArray(carta.categorias) ? (carta.categorias as any[]) : [];
  $: productos = carta && Array.isArray(carta.productos) ? (carta.productos as any[]) : [];

  // Campos meta extra (shape abierto): todo lo que no es estructural ni ya pintado.
  const META_SKIP = new Set([
    'id', 'nombre', 'estado', 'version', 'updated_at', 'categorias', 'productos', 'meta'
  ]);
  $: metaExtra = carta
    ? Object.entries(carta).filter(([k, v]) => !META_SKIP.has(k) && v !== null && v !== undefined && v !== '')
    : [];

  function estadoRgb(e: string): string {
    if (e === 'activa') return '34, 197, 94';
    if (e === 'borrador') return '245, 158, 11';
    if (e === 'archivada') return '113, 113, 122';
    return '161, 161, 170';
  }

  function humanizeFecha(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  function summarizeVal(v: unknown): string {
    if (Array.isArray(v)) return `${v.length} elemento${v.length === 1 ? '' : 's'}`;
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  // Matching shape-abierto: un producto pertenece a una categoria si su campo
  // categoria coincide con el nombre o el id de la categoria (los datos varian
  // por vertical). Productos sin match -> seccion "Otros".
  function matchCategoria(prod: any, cat: any): boolean {
    return (
      prod?.categoria === cat?.nombre ||
      prod?.categoria === cat?.id ||
      prod?.categoria_id === cat?.id
    );
  }
  function productosDe(cat: any): any[] {
    return productos.filter((p) => matchCategoria(p, cat));
  }
  $: sinCategoria = productos.filter((p) => !categorias.some((cat) => matchCategoria(p, cat)));

  function prodKey(prod: any, idx: number): string {
    return typeof prod?.id === 'string' ? prod.id : 'idx-' + idx;
  }
  function toggleProd(key: string) {
    expandedProductos[key] = !expandedProductos[key];
    expandedProductos = expandedProductos;
  }

  const PROD_ROW_SKIP = new Set(['nombre', 'precio', 'descripcion']);
  function camposExtra(prod: any): [string, unknown][] {
    return Object.entries(prod || {}).filter(
      ([k, v]) => !PROD_ROW_SKIP.has(k) && v !== null && v !== undefined && v !== ''
    );
  }
  function precioStr(prod: any): string | null {
    const p = prod?.precio;
    if (typeof p === 'number') return p.toFixed(2) + '€';
    if (typeof p === 'string' && p.trim()) return p;
    return null;
  }
  function descCorta(prod: any): string | null {
    const d = prod?.descripcion;
    if (typeof d !== 'string' || !d.trim()) return null;
    return d.length > 60 ? d.slice(0, 60) + '…' : d;
  }

  // --- Acciones Postura B (frases canonicas Q5=A) ---
  function handleEliminar() {
    if (!carta) return;
    prefillChatInput(`Archiva la carta "${carta.nombre}".`);
  }
  function handleAnadirProducto() {
    if (!carta) return;
    prefillChatInput(`Anade un producto a la carta "${carta.nombre}": [nombre + campos].`);
  }
  function handleAnadirCategoria() {
    if (!carta) return;
    prefillChatInput(`Anade la categoria "[nombre]" a la carta "${carta.nombre}".`);
  }
  function handleActualizarPrecios() {
    if (!carta) return;
    prefillChatInput(`Actualiza los precios de la carta "${carta.nombre}": [lista].`);
  }
  function handleEditarProducto(prod: any) {
    if (!carta) return;
    const pn = prod?.nombre ?? '[nombre]';
    prefillChatInput(`Edita el producto "${pn}" de la carta "${carta.nombre}". Cambia [describe que].`);
  }
</script>

<div class="detail">
  <button class="back-btn" on:click={onBack}>← Volver</button>

  {#if error}
    <div class="error"><span>{error}</span></div>
  {/if}

  {#if !carta}
    <div class="empty"><p>Carta no encontrada.</p></div>
  {:else}
    <h3>{carta.nombre}</h3>

    <div class="meta">
      {#if estado}
        <span class="badge" style="background-color: rgba({estadoRgb(estado)}, 0.13); color: rgb({estadoRgb(estado)})">
          {estado}
        </span>
      {/if}
      {#if version !== null}<span class="badge">v{version}</span>{/if}
      {#if updatedAt}<span class="badge">{humanizeFecha(updatedAt)}</span>{/if}
    </div>

    <!-- CATEGORIAS + PRODUCTOS (shape abierto) -->
    {#if categorias.length > 0}
      {#each categorias as cat}
        <div class="cat-section">
          <h4 class="cat-title">{cat.nombre ?? '(categoria sin nombre)'}</h4>
          {#if productosDe(cat).length > 0}
            <div class="prod-table">
              {#each productosDe(cat) as prod, i}
                {@const key = prodKey(prod, i)}
                <div class="prod-row" class:expanded={expandedProductos[key]}>
                  <button class="prod-main" on:click={() => toggleProd(key)}>
                    <span class="prod-caret">{expandedProductos[key] ? '▾' : '▸'}</span>
                    <span class="prod-name">{prod?.nombre ?? '(sin nombre)'}</span>
                    {#if descCorta(prod)}<span class="prod-desc">{descCorta(prod)}</span>{/if}
                    {#if precioStr(prod)}<span class="prod-precio">{precioStr(prod)}</span>{/if}
                  </button>
                  {#if expandedProductos[key]}
                    <div class="prod-extra">
                      {#each camposExtra(prod) as [k, v]}
                        <div class="extra-row"><span class="extra-k">{k}</span><span class="extra-v">{summarizeVal(v)}</span></div>
                      {/each}
                      <button class="mini-action" on:click={() => handleEditarProducto(prod)}>Editar este producto (chat)</button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="hint">Sin productos en esta categoria.</p>
          {/if}
        </div>
      {/each}
    {/if}

    {#if sinCategoria.length > 0}
      <div class="cat-section">
        <h4 class="cat-title">{categorias.length > 0 ? 'Otros' : 'Productos'}</h4>
        <div class="prod-table">
          {#each sinCategoria as prod, i}
            {@const key = prodKey(prod, i) + '-sc'}
            <div class="prod-row" class:expanded={expandedProductos[key]}>
              <button class="prod-main" on:click={() => toggleProd(key)}>
                <span class="prod-caret">{expandedProductos[key] ? '▾' : '▸'}</span>
                <span class="prod-name">{prod?.nombre ?? '(sin nombre)'}</span>
                {#if descCorta(prod)}<span class="prod-desc">{descCorta(prod)}</span>{/if}
                {#if precioStr(prod)}<span class="prod-precio">{precioStr(prod)}</span>{/if}
              </button>
              {#if expandedProductos[key]}
                <div class="prod-extra">
                  {#each camposExtra(prod) as [k, v]}
                    <div class="extra-row"><span class="extra-k">{k}</span><span class="extra-v">{summarizeVal(v)}</span></div>
                  {/each}
                  <button class="mini-action" on:click={() => handleEditarProducto(prod)}>Editar este producto (chat)</button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if categorias.length === 0 && productos.length === 0}
      <p class="hint">Esta carta no tiene productos ni categorias todavia.</p>
    {/if}

    <!-- META EXTRA plegable (campos no estandar del shape abierto) -->
    {#if metaExtra.length > 0}
      <button class="meta-toggle" on:click={() => (showMeta = !showMeta)}>
        {showMeta ? '▾' : '▸'} Metadatos ({metaExtra.length})
      </button>
      {#if showMeta}
        <div class="meta-extra">
          {#each metaExtra as [k, v]}
            <div class="extra-row"><span class="extra-k">{k}</span><span class="extra-v">{summarizeVal(v)}</span></div>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- BARRA DE ACCIONES (Postura B: pre-rellenan el chat) -->
    <div class="actions">
      <button class="action-btn" on:click={handleAnadirProducto}>Anadir producto</button>
      <button class="action-btn" on:click={handleAnadirCategoria}>Anadir categoria</button>
      <button class="action-btn" on:click={handleActualizarPrecios}>Actualizar precios</button>
      <button class="action-btn" on:click={onVerHistorial}>Ver historial</button>
      <button class="action-btn danger" on:click={handleEliminar}>Archivar</button>
    </div>

    <p class="hint chat-hint">
      Las acciones pre-rellenan el chat — revisa el mensaje y envialo para que el agente lo ejecute.
    </p>
  {/if}
</div>

<style>
  .detail { height: 100%; overflow-y: auto; padding: 12px; }

  .back-btn {
    background: none;
    border: none;
    color: var(--accent-color, rgba(96, 165, 250, 1));
    cursor: pointer;
    padding: 4px 0;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .error {
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.15);
    color: rgba(248, 113, 113, 1);
    font-size: 12px;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  .empty { text-align: center; padding: 32px 16px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }

  h3 { margin: 0 0 8px; font-size: 16px; }

  .meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, rgba(228, 228, 231, 1));
  }

  .cat-section { margin-bottom: 14px; }
  .cat-title {
    margin: 12px 0 6px;
    font-size: 13px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    border-bottom: 1px solid var(--border-color, #333);
    padding-bottom: 4px;
  }

  .prod-table { display: flex; flex-direction: column; gap: 2px; }
  .prod-row {
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }
  .prod-row.expanded { background: rgba(96, 165, 250, 0.06); }
  .prod-main {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }
  .prod-main:hover { background: rgba(255, 255, 255, 0.05); }
  .prod-caret { color: var(--text-secondary, rgba(113, 113, 122, 1)); font-size: 10px; width: 10px; }
  .prod-name { font-weight: 600; }
  .prod-desc { color: var(--text-secondary, rgba(161, 161, 170, 1)); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prod-precio { margin-left: auto; font-family: monospace; color: var(--accent-color, rgba(96, 165, 250, 1)); font-weight: 600; }

  .prod-extra { padding: 6px 10px 8px 26px; display: flex; flex-direction: column; gap: 3px; }
  .extra-row { display: flex; gap: 10px; font-size: 11px; }
  .extra-k { color: var(--text-secondary, rgba(113, 113, 122, 1)); min-width: 100px; font-family: monospace; }
  .extra-v { color: var(--text-primary, rgba(228, 228, 231, 1)); flex: 1; word-break: break-word; }
  .mini-action {
    margin-top: 6px;
    align-self: flex-start;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    cursor: pointer;
    font-size: 11px;
  }
  .mini-action:hover { background: rgba(96, 165, 250, 0.15); color: var(--accent-color, rgba(96, 165, 250, 1)); }

  .meta-toggle {
    background: none;
    border: none;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    cursor: pointer;
    font-size: 12px;
    padding: 8px 0;
    margin-top: 8px;
  }
  .meta-extra {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #333);
  }
  .action-btn {
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    color: var(--text-primary, rgba(228, 228, 231, 1));
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s;
  }
  .action-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: var(--accent-color, rgba(96, 165, 250, 1)); }
  .action-btn.danger { color: rgba(248, 113, 113, 1); border-color: rgba(239, 68, 68, 0.4); }
  .action-btn.danger:hover { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 1); }

  .hint { font-size: 12px; color: var(--text-secondary, rgba(161, 161, 170, 1)); }
  .chat-hint {
    margin-top: 16px;
    padding: 8px 12px;
    background: rgba(96, 165, 250, 0.06);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-secondary, rgba(161, 161, 170, 1));
    font-style: italic;
    text-align: center;
  }
</style>
