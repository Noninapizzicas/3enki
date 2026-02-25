<script lang="ts">
  /**
   * ItemLine — Línea de item en la tarjeta de pedido cocina
   *
   * Muestra TODA la información del producto:
   *   - Cantidad + nombre + badge tipo (MITAD, AL GUSTO)
   *   - Mitad/Mitad: ambas mitades con ingredientes base
   *   - Al Gusto: lista completa de ingredientes seleccionados
   *   - Variaciones: SIN (rojo) y + (verde) siempre visibles
   *   - Notas: siempre visibles, fondo amarillo
   *
   * Tap toggle: pendiente → preparando → listo
   * Target mínimo 60px para manos con harina
   * Texto grande legible a 2m
   */
  import { createEventDispatcher } from 'svelte';
  import type { ItemCocina, PizzaHalf, IngredienteAlGusto } from '$lib/stores/cocina';
  import { ESTADO_ITEM_COLORS } from '$lib/stores/cocina';

  export let item: ItemCocina;

  const dispatch = createEventDispatcher<{
    'tap': { item_id: string };
  }>();

  $: color = ESTADO_ITEM_COLORS[item.estado];
  $: isListo = item.estado === 'listo';
  $: isPreparando = item.estado === 'preparando';

  // — Mitad y Mitad —
  $: isMitad = item.tipo === 'mitad_mitad' && (item.pizza_izquierda || item.pizza_derecha);
  $: pizzaIzq = parsePizzaHalf(item.pizza_izquierda);
  $: pizzaDer = parsePizzaHalf(item.pizza_derecha);

  // — Al Gusto —
  $: isAlGusto = item.tipo === 'al_gusto' && item.ingredientes?.length;
  $: ingredientesAlGusto = (item.ingredientes || []).map(parseIngrediente);

  // — Ingredientes base (todos los productos) —
  $: hasIngredientesBase = !isMitad && !isAlGusto && item.ingredientes_base?.length;

  // — Variaciones (quitar / añadir) —
  $: quitarList = extractQuitar(item);
  $: anadirList = extractAnadir(item);
  $: hasVariaciones = quitarList.length > 0 || anadirList.length > 0;

  // — Tiene detalles extra —
  $: hasDetails = isMitad || isAlGusto || hasIngredientesBase || hasVariaciones || !!item.notas;

  // ——————————————————————————————————————————
  // Helpers para extraer datos con formatos flexibles
  // ——————————————————————————————————————————

  function parsePizzaHalf(half: string | PizzaHalf | undefined | null): { nombre: string; ingredientes: string[] } | null {
    if (!half) return null;
    if (typeof half === 'string') return { nombre: half, ingredientes: [] };
    return {
      nombre: half.nombre || '???',
      ingredientes: half.ingredientes_base || []
    };
  }

  function parseIngrediente(ing: string | IngredienteAlGusto): string {
    if (typeof ing === 'string') return ing;
    return ing.nombre || '???';
  }

  function extractQuitar(item: ItemCocina): string[] {
    if (!item.variaciones) return [];
    const v = item.variaciones as any;

    // Formato nuevo (objeto): { ingredientes_quitar: string[] }
    if (Array.isArray(v.ingredientes_quitar)) {
      return v.ingredientes_quitar.map((i: any) => typeof i === 'string' ? i : i.nombre || '???');
    }

    // Formato legacy (array): [{ tipo: 'quitar', ingrediente_id | nombre }]
    if (Array.isArray(v)) {
      return v
        .filter((x: any) => x.tipo === 'quitar')
        .map((x: any) => x.nombre || x.ingrediente_id || '???');
    }

    return [];
  }

  function extractAnadir(item: ItemCocina): { nombre: string; cantidad?: number }[] {
    if (!item.variaciones) return [];
    const v = item.variaciones as any;

    // Formato nuevo (objeto): { ingredientes_anadir: [{ nombre, cantidad? }] }
    if (Array.isArray(v.ingredientes_anadir)) {
      return v.ingredientes_anadir.map((i: any) => {
        if (typeof i === 'string') return { nombre: i };
        return { nombre: i.nombre || '???', cantidad: i.cantidad };
      });
    }

    // Formato legacy (array): [{ tipo: 'anadir', ingrediente_id | nombre, cantidad? }]
    if (Array.isArray(v)) {
      return v
        .filter((x: any) => x.tipo === 'anadir')
        .map((x: any) => ({
          nombre: x.nombre || x.ingrediente_id || '???',
          cantidad: x.cantidad
        }));
    }

    return [];
  }

  function handleTap() {
    if (!isListo) {
      dispatch('tap', { item_id: item.item_id });
    }
  }
</script>

<button
  class="item-line"
  class:listo={isListo}
  class:preparando={isPreparando}
  class:has-details={hasDetails}
  style="--item-color: {color}"
  on:click={handleTap}
  disabled={isListo}
>
  <div class="item-state">
    {#if isListo}
      <span class="check">&#10003;</span>
    {:else if isPreparando}
      <span class="fire">&#9711;</span>
    {:else}
      <span class="dot">&#9679;</span>
    {/if}
  </div>

  <div class="item-info">
    <!-- Línea principal: cantidad + nombre + badge tipo -->
    <div class="item-main">
      <span class="qty">{item.cantidad}x</span>
      <span class="name">{item.nombre}</span>
      {#if item.tipo === 'mitad_mitad'}
        <span class="tipo-badge badge-mitad">MITAD</span>
      {:else if item.tipo === 'al_gusto'}
        <span class="tipo-badge badge-algusto">AL GUSTO</span>
      {/if}
    </div>

    <!-- ============ INGREDIENTES BASE (productos regulares) ============ -->
    {#if hasIngredientesBase}
      <div class="detail-section base-section">
        <span class="base-ings">{item.ingredientes_base?.join(', ')}</span>
      </div>
    {/if}

    <!-- ============ MITAD Y MITAD ============ -->
    {#if isMitad}
      <div class="detail-section mitad-section">
        {#if pizzaIzq}
          <div class="mitad-half">
            <span class="mitad-arrow left">&#9664;</span>
            <span class="mitad-name">{pizzaIzq.nombre}</span>
            {#if pizzaIzq.ingredientes.length > 0}
              <span class="mitad-ings">{pizzaIzq.ingredientes.join(', ')}</span>
            {/if}
          </div>
        {/if}
        {#if pizzaDer}
          <div class="mitad-half">
            <span class="mitad-arrow right">&#9654;</span>
            <span class="mitad-name">{pizzaDer.nombre}</span>
            {#if pizzaDer.ingredientes.length > 0}
              <span class="mitad-ings">{pizzaDer.ingredientes.join(', ')}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ============ AL GUSTO ============ -->
    {#if isAlGusto}
      <div class="detail-section algusto-section">
        <span class="section-label">INGREDIENTES:</span>
        <div class="algusto-list">
          {#each ingredientesAlGusto as ing}
            <span class="algusto-ing">{ing}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ============ VARIACIONES ============ -->
    {#if hasVariaciones}
      <div class="detail-section variaciones-section">
        {#each quitarList as nombre}
          <div class="var-line var-quitar">
            <span class="var-icon">&#10005;</span>
            <span>SIN {nombre.toUpperCase()}</span>
          </div>
        {/each}
        {#each anadirList as item}
          <div class="var-line var-anadir">
            <span class="var-icon">+</span>
            <span>
              {#if item.cantidad && item.cantidad > 1}{item.cantidad}x{/if}
              {item.nombre.toUpperCase()}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- ============ NOTAS ============ -->
    {#if item.notas}
      <div class="detail-section notas-section">
        <span class="nota-label">NOTA:</span>
        <span class="nota-text">{item.notas}</span>
      </div>
    {/if}
  </div>
</button>

<style>
  .item-line {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 10px 14px;
    border: none;
    border-left: 4px solid var(--item-color);
    background: transparent;
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, opacity 0.3s;
    -webkit-tap-highlight-color: transparent;
  }

  .item-line.has-details {
    padding-bottom: 14px;
  }

  .item-line:not(.listo):active {
    background: rgba(255, 255, 255, 0.05);
  }

  .item-line.listo {
    opacity: 0.4;
    cursor: default;
  }

  .item-line.listo .item-main {
    text-decoration: line-through;
    text-decoration-color: #22c55e;
  }

  .item-line.preparando {
    background: rgba(234, 179, 8, 0.08);
  }

  /* State indicator */
  .item-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .check {
    font-size: 1.4rem;
    color: #22c55e;
    font-weight: 800;
  }

  .fire {
    font-size: 1.2rem;
    color: #eab308;
    animation: spin-slow 2s linear infinite;
  }

  .dot {
    font-size: 0.8rem;
    color: #64748b;
  }

  /* Info container */
  .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Main line: qty + name + badge */
  .item-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .qty {
    font-size: 2rem;
    font-weight: 800;
    color: var(--item-color);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .name {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.1;
    word-break: break-word;
  }

  /* Tipo badge */
  .tipo-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 1px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .badge-mitad {
    background: #7c3aed;
    color: #f5f3ff;
  }

  .badge-algusto {
    background: #0891b2;
    color: #ecfeff;
  }

  /* ——— Detail sections (shared) ——— */
  .detail-section {
    margin-top: 2px;
    padding-left: 2px;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    letter-spacing: 1px;
    display: block;
    margin-bottom: 3px;
  }

  /* ——— INGREDIENTES BASE ——— */
  .base-section {
    padding: 4px 8px;
    background: rgba(148, 163, 184, 0.08);
    border-radius: 6px;
    border-left: 3px solid #475569;
  }

  .base-ings {
    font-size: 1rem;
    color: #94a3b8;
    font-style: italic;
    line-height: 1.3;
  }

  /* ——— MITAD Y MITAD ——— */
  .mitad-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: rgba(124, 58, 237, 0.1);
    border-radius: 6px;
    border-left: 3px solid #7c3aed;
  }

  .mitad-half {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mitad-arrow {
    font-size: 0.85rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .mitad-arrow.left { color: #a78bfa; }
  .mitad-arrow.right { color: #c084fc; }

  .mitad-name {
    font-size: 1.2rem;
    font-weight: 700;
    color: #e2e8f0;
  }

  .mitad-ings {
    font-size: 0.9rem;
    color: #94a3b8;
    font-style: italic;
  }

  /* ——— AL GUSTO ——— */
  .algusto-section {
    padding: 6px 8px;
    background: rgba(8, 145, 178, 0.1);
    border-radius: 6px;
    border-left: 3px solid #0891b2;
  }

  .algusto-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }

  .algusto-ing {
    font-size: 1.1rem;
    font-weight: 600;
    color: #67e8f9;
  }

  .algusto-ing::before {
    content: '\2022 ';
    color: #0891b2;
  }

  /* ——— VARIACIONES ——— */
  .variaciones-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .var-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .var-icon {
    flex-shrink: 0;
    width: 18px;
    text-align: center;
    font-weight: 900;
  }

  .var-quitar {
    color: #f87171;
  }

  .var-quitar .var-icon {
    color: #ef4444;
  }

  .var-anadir {
    color: #4ade80;
  }

  .var-anadir .var-icon {
    color: #22c55e;
  }

  /* ——— NOTAS ——— */
  .notas-section {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 8px;
    background: rgba(251, 191, 36, 0.12);
    border-radius: 6px;
    border-left: 3px solid #f59e0b;
  }

  .nota-label {
    font-size: 0.75rem;
    font-weight: 800;
    color: #f59e0b;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .nota-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fbbf24;
    word-break: break-word;
  }

  /* Animations */
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 600px) {
    .qty { font-size: 1.5rem; }
    .name { font-size: 1.2rem; }
    .base-ings { font-size: 0.85rem; }
    .mitad-name { font-size: 1rem; }
    .mitad-ings { font-size: 0.8rem; }
    .algusto-ing { font-size: 0.9rem; }
    .var-line { font-size: 0.9rem; }
    .nota-text { font-size: 0.9rem; }
  }
</style>
