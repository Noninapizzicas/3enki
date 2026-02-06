<script lang="ts">
  /**
   * VariacionesPanel — Flotante para personalizar producto
   *
   * - Ingredientes base: tap = rojo (quitar)
   * - Resto de ingredientes de la carta: tap = verde (añadir)
   * - Precio dinámico
   *
   * Usa módulos: variaciones (config) + ingredientes (catálogo completo)
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let producto: {
    id: string;
    nombre: string;
    precio: number;
    ingredientes?: { id: string; nombre: string; emoji?: string }[];
  };

  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: {
      producto_id: string;
      ingredientes_quitar: string[];
      ingredientes_anadir: { ingrediente_id: string; cantidad: number }[];
      precio_total: number;
    };
  }>();

  // Estado
  let loading = true;
  let error: string | null = null;

  // Config variaciones (del backend)
  let permiteQuitar: string[] = [];
  let permiteAnadir: boolean = false;
  let maxExtras: number = 5;

  // Ingredientes base del producto
  let ingredientesBase: { id: string; nombre: string; emoji?: string }[] = [];

  // Catálogo completo de ingredientes (filtrado: sin los del producto)
  let ingredientesDisponibles: {
    id: string;
    nombre: string;
    emoji?: string;
    precio_extra: number;
    tipo?: string;
    disponible: boolean;
  }[] = [];

  // Selecciones del usuario
  let quitarSeleccionados: Set<string> = new Set();
  let anadirSeleccionados: Map<string, number> = new Map(); // id -> cantidad

  // Precio calculado
  $: precioBase = producto.precio;
  $: precioExtras = calcularPrecioExtras();
  $: precioTotal = precioBase + precioExtras;

  function calcularPrecioExtras(): number {
    let total = 0;
    anadirSeleccionados.forEach((cantidad, id) => {
      const ing = ingredientesDisponibles.find(i => i.id === id);
      if (ing) {
        total += (ing.precio_extra || 0) * cantidad;
      }
    });
    return total;
  }

  // Toggle quitar ingrediente
  function toggleQuitar(id: string) {
    if (quitarSeleccionados.has(id)) {
      quitarSeleccionados.delete(id);
    } else {
      quitarSeleccionados.add(id);
    }
    quitarSeleccionados = new Set(quitarSeleccionados);
  }

  // Toggle añadir ingrediente
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

  // Cargar config de variaciones + catálogo de ingredientes
  async function loadData() {
    loading = true;
    error = null;

    try {
      // Cargar en paralelo: config variaciones + catálogo ingredientes
      const [varRes, ingRes] = await Promise.all([
        mqttRequest('variaciones', 'get', { producto_id: producto.id }),
        mqttRequest('ingredientes', 'list', {})
      ]);

      // Config variaciones
      if (varRes?.data) {
        permiteQuitar = varRes.data.permite_quitar || [];
        permiteAnadir = varRes.data.permite_anadir !== false; // default true
        maxExtras = varRes.data.max_ingredientes_extra || 10;
      } else {
        // Si no hay config, permitir todo por defecto
        permiteAnadir = true;
        maxExtras = 10;
      }

      // Ingredientes base del producto
      ingredientesBase = producto.ingredientes || [];
      const baseIds = new Set(ingredientesBase.map(i => i.id));

      // Si no tenemos permiteQuitar, asumir que todos los base se pueden quitar
      if (permiteQuitar.length === 0 && ingredientesBase.length > 0) {
        permiteQuitar = ingredientesBase.map(i => i.id);
      }

      // Catálogo: filtrar ingredientes que no están en el producto
      const todosIngredientes = ingRes?.data?.ingredientes || [];
      ingredientesDisponibles = todosIngredientes
        .filter((ing: any) => !baseIds.has(ing.id))
        .filter((ing: any) => ing.disponible !== false)
        .map((ing: any) => ({
          id: ing.id,
          nombre: ing.nombre,
          emoji: ing.emoji,
          precio_extra: ing.precio_extra || 0,
          tipo: ing.tipo,
          disponible: ing.disponible !== false
        }))
        .sort((a: any, b: any) => {
          // Ordenar por tipo, luego por nombre
          if (a.tipo !== b.tipo) return (a.tipo || '').localeCompare(b.tipo || '');
          return a.nombre.localeCompare(b.nombre);
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
    const ingredientes_quitar = Array.from(quitarSeleccionados);
    const ingredientes_anadir = Array.from(anadirSeleccionados.entries()).map(([id, cantidad]) => ({
      ingrediente_id: id,
      cantidad
    }));

    dispatch('confirm', {
      producto_id: producto.id,
      ingredientes_quitar,
      ingredientes_anadir,
      precio_total: precioTotal
    });
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  function getIngredienteNombre(id: string): string {
    const base = ingredientesBase.find(i => i.id === id);
    if (base) return base.emoji ? `${base.emoji} ${base.nombre}` : base.nombre;
    const extra = ingredientesDisponibles.find(i => i.id === id);
    if (extra) return extra.emoji ? `${extra.emoji} ${extra.nombre}` : extra.nombre;
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
          <!-- Ingredientes base (quitar) -->
          {#if ingredientesBase.length > 0}
            <section class="section">
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

          <!-- Todos los ingredientes de la carta (añadir) -->
          {#if permiteAnadir && ingredientesDisponibles.length > 0}
            <section class="section">
              <h3 class="section-title">
                ➕ Añadir de la carta
                <span class="max-hint">({anadirSeleccionados.size}/{maxExtras})</span>
              </h3>
              <div class="chips-grid">
                {#each ingredientesDisponibles as ing}
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
    max-width: 480px;
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
    margin-bottom: 20px;
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

  .max-hint {
    font-weight: 400;
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

  .chip.extra:not(.added):not(:disabled):hover {
    border-color: #555;
  }

  .chip.added {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
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
    color: #22c55e;
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
