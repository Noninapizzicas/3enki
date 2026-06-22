<script lang="ts">
  /**
   * VariacionesPanel v3.0 — Personalizar producto por ingredientes de su grupo
   *
   * Estructura:
   *   1. Arriba: ingredientes del producto (tap = rojo para quitar)
   *   2. Abajo: ingredientes del mismo GRUPO organizados por TIPO con colores
   *
   * Reglas:
   *   - Solo se pueden quitar ingredientes que lleva el producto
   *   - Solo se pueden añadir ingredientes del mismo grupo (categoría)
   *   - Los ingredientes de otro grupo NO aparecen
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let producto: {
    id: string;
    nombre: string;
    precio: number;
    categoria?: string;
    ingredientes_base?: { id: string; nombre: string; emoji?: string }[];
    ingredientes?: { id: string; nombre: string; emoji?: string }[];
  };

  export let visible: boolean = true;
  export let projectId: string = '';
  export let catalogoIngredientes: any[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: {
      producto_id: string;
      ingredientes_quitar: string[];
      ingredientes_anadir: { nombre: string; cantidad: number; precio_extra?: number }[];
      ingredientes_base: string[];
      precio_total: number;
    };
  }>();

  // Config de tipos — orden visual y colores
  const tipoConfig: Record<string, { emoji: string; label: string; orden: number; color: string; bg: string }> = {
    queso:      { emoji: '🧀', label: 'Queso',           orden: 1, color: '#facc15', bg: 'rgba(250, 204, 21, 0.12)' },
    verdura:    { emoji: '🥬', label: 'Verdura',         orden: 2, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
    carne:      { emoji: '🍖', label: 'Carne y Embutido',orden: 3, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
    marisco:    { emoji: '🐟', label: 'Pescado/Marisco', orden: 4, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
    salsa:      { emoji: '🍅', label: 'Salsa',           orden: 5, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
    masa:       { emoji: '🫓', label: 'Masa/Base',       orden: 6, color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)' },
    otro:       { emoji: '📦', label: 'Otro',            orden: 9, color: '#888',    bg: 'rgba(136, 136, 136, 0.12)' }
  };

  // Estado
  let loading = true;
  let error: string | null = null;

  // Config variaciones (del backend)
  let permiteQuitar: string[] = [];
  let permiteAnadir: boolean = false;
  let maxExtras: number = 10;
  let grupo: string = '';

  // Ingredientes base del producto
  let ingredientesBase: { id: string; nombre: string; emoji?: string }[] = [];

  // Ingredientes del grupo organizados por tipo
  let ingredientesPorTipo: Map<string, any[]> = new Map();
  let tiposOrden: string[] = [];

  // Selecciones del usuario
  let quitarSeleccionados: Set<string> = new Set();
  let anadirSeleccionados: Map<string, number> = new Map(); // id -> cantidad

  // Precio calculado
  $: precioBase = producto.precio;
  $: precioExtras = calcPrecioExtras(anadirSeleccionados);
  $: precioTotal = precioBase + precioExtras;

  function calcPrecioExtras(seleccionados: Map<string, number>): number {
    let total = 0;
    seleccionados.forEach((cantidad, id) => {
      for (const [, ingredientes] of ingredientesPorTipo) {
        const ing = ingredientes.find((i: any) => i.id === id);
        if (ing) {
          total += (ing.precio_extra || 0) * cantidad;
          break;
        }
      }
    });
    return total;
  }

  function toggleQuitar(id: string) {
    if (quitarSeleccionados.has(id)) {
      quitarSeleccionados.delete(id);
    } else {
      quitarSeleccionados.add(id);
    }
    quitarSeleccionados = new Set(quitarSeleccionados);
  }

  function toggleAnadir(id: string) {
    if (anadirSeleccionados.has(id)) {
      anadirSeleccionados.delete(id);
    } else {
      if (anadirSeleccionados.size < maxExtras) {
        anadirSeleccionados.set(id, 1);
      }
    }
    anadirSeleccionados = new Map(anadirSeleccionados);
  }

  async function loadData() {
    loading = true;
    error = null;

    try {
      // Config del backend — ahora trae `opciones` (subsistema Opciones). Soft-fail.
      const varRes = await mqttRequest('variaciones', 'get', { producto_id: producto.id }).catch(() => null);
      const varData = varRes?.data;
      const opciones: any[] | null = Array.isArray(varData?.opciones) ? varData.opciones : null;

      let disponibles: any[] = [];

      if (opciones) {
        // ── RENDER POR MODO (Opciones): el dato manda (incluido [] = nada que quitar/añadir). ──
        const quitarOp = opciones.find((o: any) => o.modo === 'QUITAR');
        const addOps = opciones.filter((o: any) => o.modo === 'ELEGIR_VARIOS');

        ingredientesBase = (quitarOp?.valores || []).map((v: any) => ({ id: v.id, nombre: v.etiqueta, emoji: v.emoji }));
        permiteQuitar = ingredientesBase.map(i => i.id);
        permiteAnadir = addOps.length > 0;
        maxExtras = addOps.reduce((mx: number, o: any) => Math.max(mx, Number.isInteger(o.max) ? o.max : 10), 0) || 10;

        // familia sólo para colorear: lookup en el catálogo proyectado (presentación); si no, 'otro'.
        const famById = new Map<string, string>((catalogoIngredientes || []).map((c: any) => [c.id, (c.familia || c.tipo || 'otro')]));
        const baseIds = new Set(ingredientesBase.map(i => i.id));
        for (const op of addOps) {
          for (const v of (op.valores || [])) {
            if (v.disponible === false || baseIds.has(v.id)) continue;
            disponibles.push({
              id: v.id,
              nombre: v.etiqueta,
              emoji: v.emoji,
              precio_extra: (Number(v.delta_precio_centimos) || 0) / 100,   // céntimos → euros (el panel cobra en €)
              tipo: String(famById.get(v.id) || famById.get(v.ref) || 'otro').toLowerCase(),
              disponible: true
            });
          }
        }
      } else {
        // ── LEGACY: backend sin `opciones` (warm aún no llegó) → catálogo proyectado (compat). ──
        ingredientesBase = producto.ingredientes_base || producto.ingredientes || [];
        const baseIds = new Set(ingredientesBase.map(i => i.id));
        grupo = producto.categoria || '';
        if (varData) {
          permiteQuitar = varData.permite_quitar || [];
          permiteAnadir = varData.permite_anadir !== false;
          maxExtras = varData.max_ingredientes_extra || 10;
          if (varData.grupo) grupo = varData.grupo;
        } else {
          permiteAnadir = true;
          maxExtras = 10;
        }
        if (permiteQuitar.length === 0 && ingredientesBase.length > 0) {
          permiteQuitar = ingredientesBase.map(i => i.id);
        }
        disponibles = (catalogoIngredientes || [])
          .filter((ing: any) => {
            if (grupo && ing.grupos && ing.grupos.length > 0 && !ing.grupos.includes(grupo)) return false;
            if (baseIds.has(ing.id)) return false;
            if (ing.disponible === false || ing.activo === false) return false;
            return true;
          })
          .map((ing: any) => ({
            id: ing.id,
            nombre: ing.nombre,
            emoji: ing.emoji,
            precio_extra: ing.precio_extra || 0,
            tipo: (ing.familia || ing.tipo || 'otro').toLowerCase(),
            disponible: true
          }));
      }

      // Agrupar por tipo
      ingredientesPorTipo = new Map();
      for (const ing of disponibles) {
        const tipo = ing.tipo;
        if (!ingredientesPorTipo.has(tipo)) {
          ingredientesPorTipo.set(tipo, []);
        }
        ingredientesPorTipo.get(tipo)!.push(ing);
      }

      // Ordenar ingredientes dentro de cada tipo
      ingredientesPorTipo.forEach((lista) => {
        lista.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
      });

      // Ordenar tipos
      tiposOrden = Array.from(ingredientesPorTipo.keys()).sort((a, b) => {
        const ordenA = tipoConfig[a]?.orden || 99;
        const ordenB = tipoConfig[b]?.orden || 99;
        return ordenA - ordenB;
      });

      loading = false;
    } catch (err: any) {
      error = err?.message || 'Error al cargar datos';
      loading = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }

  function handleConfirm() {
    const ingredientes_quitar = Array.from(quitarSeleccionados).map(id => {
      const base = ingredientesBase.find(i => i.id === id);
      return base?.nombre || id;
    });

    const ingredientes_anadir: { nombre: string; cantidad: number; precio_extra?: number }[] = [];
    anadirSeleccionados.forEach((cantidad, id) => {
      for (const [, ingredientes] of ingredientesPorTipo) {
        const ing = ingredientes.find((i: any) => i.id === id);
        if (ing) {
          ingredientes_anadir.push({
            nombre: ing.nombre,
            cantidad,
            precio_extra: ing.precio_extra || 0
          });
          break;
        }
      }
    });

    const ingredientes_base = ingredientesBase.map(i => i.nombre);

    dispatch('confirm', {
      producto_id: producto.id,
      ingredientes_quitar,
      ingredientes_anadir,
      ingredientes_base,
      precio_total: precioTotal
    });
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  function getTipoInfo(tipo: string) {
    return tipoConfig[tipo] || tipoConfig['otro'];
  }

  function findIngrediente(id: string): any {
    for (const [, ingredientes] of ingredientesPorTipo) {
      const ing = ingredientes.find((i: any) => i.id === id);
      if (ing) return ing;
    }
    return null;
  }

  function getIngredienteNombre(id: string): string {
    const base = ingredientesBase.find(i => i.id === id);
    if (base) return base.nombre;
    const extra = findIngrediente(id);
    if (extra) return extra.nombre;
    return id;
  }

  onMount(() => {
    loadData();
  });
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <div class="producto-info">
          <span class="producto-nombre">🍕 {producto.nombre}</span>
          <span class="producto-precio">{formatPrecio(precioBase)}</span>
        </div>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>

      <!-- Content -->
      <div class="panel-content">
        {#if loading}
          <div class="loading">⏳ Cargando ingredientes...</div>
        {:else if error}
          <div class="error">❌ {error}</div>
        {:else}
          <!-- SECCIÓN 1: Ingredientes del producto (quitar) -->
          {#if ingredientesBase.length > 0}
            <section class="section section-base">
              <h3 class="section-title">🧾 Ingredientes del producto</h3>
              <div class="chips-grid">
                {#each ingredientesBase as ing}
                  {@const canRemove = permiteQuitar.includes(ing.id)}
                  {@const isRemoved = quitarSeleccionados.has(ing.id)}
                  <button
                    class="chip"
                    class:removable={canRemove}
                    class:removed={isRemoved}
                    disabled={!canRemove}
                    on:click={() => canRemove && toggleQuitar(ing.id)}
                    title={canRemove ? 'Pulsa para quitar' : 'No se puede quitar'}
                  >
                    {#if isRemoved}
                      <span class="chip-icon">🚫</span>
                    {:else if ing.emoji}
                      <span class="chip-icon">{ing.emoji}</span>
                    {/if}
                    <span class="chip-name">{ing.nombre}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}

          <!-- SECCIÓN 2+: Ingredientes del grupo por tipo (añadir) -->
          {#if permiteAnadir && tiposOrden.length > 0}
            <div class="section-divider">
              <span>➕ Añadir ingredientes</span>
              <span class="max-hint">({anadirSeleccionados.size}/{maxExtras})</span>
            </div>

            {#each tiposOrden as tipo}
              {@const tipoInfo = getTipoInfo(tipo)}
              {@const ingredientes = ingredientesPorTipo.get(tipo) || []}
              <section class="section tipo-section" style="--tipo-color: {tipoInfo.color}; --tipo-bg: {tipoInfo.bg}">
                <h3 class="tipo-header">
                  <span class="tipo-emoji">{tipoInfo.emoji}</span>
                  <span class="tipo-label">{tipoInfo.label}</span>
                  <span class="tipo-count">({ingredientes.length})</span>
                </h3>
                <div class="chips-grid">
                  {#each ingredientes as ing}
                    {@const isAdded = anadirSeleccionados.has(ing.id)}
                    {@const isDisabled = !isAdded && anadirSeleccionados.size >= maxExtras}
                    <button
                      class="chip extra"
                      class:added={isAdded}
                      disabled={isDisabled}
                      on:click={() => !isDisabled && toggleAnadir(ing.id)}
                      title={isDisabled ? `Máximo ${maxExtras} extras` : 'Pulsa para añadir'}
                    >
                      {#if isAdded}
                        <span class="chip-icon">✅</span>
                      {:else if ing.emoji}
                        <span class="chip-icon">{ing.emoji}</span>
                      {/if}
                      <span class="chip-name">{ing.nombre}</span>
                      {#if ing.precio_extra > 0}
                        <span class="chip-price">+{formatPrecio(ing.precio_extra)}</span>
                      {:else}
                        <span class="chip-price free">gratis</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </section>
            {/each}
          {/if}

          <!-- Resumen de cambios -->
          {#if quitarSeleccionados.size > 0 || anadirSeleccionados.size > 0}
            <section class="section resumen">
              {#if quitarSeleccionados.size > 0}
                <p class="resumen-line quitar">
                  🚫 <strong>Sin:</strong>
                  {Array.from(quitarSeleccionados).map(id => getIngredienteNombre(id)).join(', ')}
                </p>
              {/if}
              {#if anadirSeleccionados.size > 0}
                <p class="resumen-line anadir">
                  ✨ <strong>Con:</strong>
                  {Array.from(anadirSeleccionados.keys()).map(id => getIngredienteNombre(id)).join(', ')}
                </p>
              {/if}
            </section>
          {/if}
        {/if}
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        <div class="total">
          <span class="total-label">💰 Total</span>
          <span class="total-amount">{formatPrecio(precioTotal)}</span>
        </div>
        <button class="confirm-btn" on:click={handleConfirm} disabled={loading}>
          ✅ Añadir
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .panel {
    background: #111;
    border: 1px solid #333;
    border-radius: 16px;
    width: 100%;
    max-width: 520px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid #222;
    background: #1a1a1a;
  }

  .producto-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .producto-nombre {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
  }

  .producto-precio {
    font-size: 0.85rem;
    color: #888;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: #333;
    color: #888;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: #444;
    color: #fff;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .loading, .error {
    text-align: center;
    padding: 32px;
    color: #666;
  }

  .error {
    color: #ef4444;
  }

  .section {
    margin-bottom: 16px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0 0 10px 0;
  }

  /* Divider between base and extras */
  .section-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    margin: 4px 0 12px;
    border-top: 1px solid #333;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
  }

  .max-hint {
    font-weight: 400;
    color: #555;
  }

  /* Tipo sections with colored borders */
  .tipo-section {
    border-left: 3px solid var(--tipo-color, #888);
    padding-left: 12px;
    margin-bottom: 20px;
  }

  .tipo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px 0;
    padding-bottom: 6px;
  }

  .tipo-emoji {
    font-size: 1rem;
  }

  .tipo-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tipo-color, #888);
  }

  .tipo-count {
    font-size: 0.65rem;
    color: #555;
  }

  .chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Chips */
  .chip {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 12px;
    border: 2px solid #333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #ccc;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
    min-width: 70px;
  }

  .chip:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .chip.removable:not(.removed):hover {
    border-color: #555;
  }

  .chip.removed {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    text-decoration: line-through;
  }

  /* Extra chips use tipo color when added */
  .chip.extra:not(.added):not(:disabled):hover {
    border-color: var(--tipo-color, #555);
    background: var(--tipo-bg, transparent);
  }

  .chip.added {
    border-color: var(--tipo-color, #22c55e);
    background: var(--tipo-bg, rgba(34, 197, 94, 0.15));
    color: var(--tipo-color, #22c55e);
  }

  .chip-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .chip-name {
    font-weight: 600;
    text-align: center;
  }

  .chip-price {
    font-size: 0.6rem;
    color: #888;
  }

  .chip-price.free {
    color: #22c55e;
    font-style: italic;
  }

  .chip.added .chip-price {
    color: var(--tipo-color, #22c55e);
  }

  /* Resumen */
  .resumen {
    background: #1a1a1a;
    border-radius: 8px;
    padding: 12px;
  }

  .resumen-line {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .resumen-line.quitar {
    color: #ef4444;
  }

  .resumen-line.anadir {
    color: #22c55e;
    margin-top: 4px;
  }

  /* Footer */
  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-top: 1px solid #222;
    background: #1a1a1a;
  }

  .total {
    display: flex;
    flex-direction: column;
  }

  .total-label {
    font-size: 0.7rem;
    color: #666;
    text-transform: uppercase;
  }

  .total-amount {
    font-size: 1.3rem;
    font-weight: 800;
    color: #fff;
  }

  .confirm-btn {
    padding: 12px 32px;
    border: none;
    border-radius: 10px;
    background: #22c55e;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }

  .confirm-btn:hover:not(:disabled) {
    background: #16a34a;
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile adjustments */
  @media (max-width: 400px) {
    .chip {
      min-width: 60px;
      padding: 6px 8px;
      font-size: 0.7rem;
    }

    .chip-icon {
      font-size: 0.9rem;
    }
  }
</style>
