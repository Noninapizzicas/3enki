<script lang="ts">
  /**
   * MitadMitadPanel — Flotante para crear pizza mitad y mitad
   *
   * - Carga pizzas disponibles desde productos.pizzas
   * - Selección visual: mitad izquierda + mitad derecha
   * - Precio = máximo de las dos pizzas
   * - Genera línea de pedido combinada
   *
   * Usa módulo: productos (pizzas)
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: {
      pizza_izquierda: Pizza;
      pizza_derecha: Pizza;
      precio_final: number;
      nombre_compuesto: string;
    };
  }>();

  interface Pizza {
    id: string;
    nombre: string;
    emoji?: string;
    precio: number;
    ingredientes_base?: { id: string; nombre: string }[];
  }

  // Estado
  let loading = true;
  let error: string | null = null;
  let pizzas: Pizza[] = [];

  // Selección
  let pizzaIzquierda: Pizza | null = null;
  let pizzaDerecha: Pizza | null = null;
  let seleccionandoLado: 'izquierda' | 'derecha' = 'izquierda';

  // Cálculos
  $: precioFinal = calcularPrecio(pizzaIzquierda, pizzaDerecha);
  $: nombreCompuesto = generarNombre(pizzaIzquierda, pizzaDerecha);
  $: seleccionCompleta = pizzaIzquierda !== null && pizzaDerecha !== null;

  function calcularPrecio(izq: Pizza | null, der: Pizza | null): number {
    if (!izq && !der) return 0;
    if (!izq) return der!.precio;
    if (!der) return izq.precio;
    // Precio = el mayor de las dos
    return Math.max(izq.precio, der.precio);
  }

  function generarNombre(izq: Pizza | null, der: Pizza | null): string {
    if (!izq && !der) return 'Pizza Mitad y Mitad';
    if (!izq) return `½ ??? + ½ ${der!.nombre}`;
    if (!der) return `½ ${izq.nombre} + ½ ???`;
    return `½ ${izq.nombre} + ½ ${der.nombre}`;
  }

  async function loadPizzas() {
    loading = true;
    error = null;

    try {
      const res = await mqttRequest('productos', 'pizzas', {});

      if (res?.status === 200 && res?.data?.pizzas) {
        pizzas = res.data.pizzas;
      } else {
        error = res?.error || 'Error al cargar pizzas';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  function selectPizza(pizza: Pizza) {
    if (seleccionandoLado === 'izquierda') {
      pizzaIzquierda = pizza;
      // Auto-cambiar a derecha si izquierda ya está seleccionada
      seleccionandoLado = 'derecha';
    } else {
      pizzaDerecha = pizza;
    }
  }

  function clearLado(lado: 'izquierda' | 'derecha') {
    if (lado === 'izquierda') {
      pizzaIzquierda = null;
      seleccionandoLado = 'izquierda';
    } else {
      pizzaDerecha = null;
      seleccionandoLado = 'derecha';
    }
  }

  function handleConfirm() {
    if (!pizzaIzquierda || !pizzaDerecha) return;

    dispatch('confirm', {
      pizza_izquierda: pizzaIzquierda,
      pizza_derecha: pizzaDerecha,
      precio_final: precioFinal,
      nombre_compuesto: nombreCompuesto
    });
  }

  function handleClose() {
    dispatch('close');
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  onMount(() => {
    loadPizzas();
  });
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <div class="header-info">
          <span class="header-icon">🍕½</span>
          <span class="header-title">Mitad y Mitad</span>
        </div>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>

      <!-- Preview visual -->
      <div class="preview-section">
        <div class="pizza-preview">
          <!-- Mitad izquierda -->
          <button
            class="mitad izquierda"
            class:selected={pizzaIzquierda !== null}
            class:active={seleccionandoLado === 'izquierda'}
            on:click={() => pizzaIzquierda ? clearLado('izquierda') : seleccionandoLado = 'izquierda'}
          >
            {#if pizzaIzquierda}
              <span class="mitad-emoji">{pizzaIzquierda.emoji || '🍕'}</span>
              <span class="mitad-nombre">{pizzaIzquierda.nombre}</span>
              <span class="mitad-clear">✕</span>
            {:else}
              <span class="mitad-placeholder">👈</span>
              <span class="mitad-label">Izquierda</span>
            {/if}
          </button>

          <!-- Divisor -->
          <div class="divisor">
            <span class="divisor-line"></span>
            <span class="divisor-icon">➕</span>
            <span class="divisor-line"></span>
          </div>

          <!-- Mitad derecha -->
          <button
            class="mitad derecha"
            class:selected={pizzaDerecha !== null}
            class:active={seleccionandoLado === 'derecha'}
            on:click={() => pizzaDerecha ? clearLado('derecha') : seleccionandoLado = 'derecha'}
          >
            {#if pizzaDerecha}
              <span class="mitad-emoji">{pizzaDerecha.emoji || '🍕'}</span>
              <span class="mitad-nombre">{pizzaDerecha.nombre}</span>
              <span class="mitad-clear">✕</span>
            {:else}
              <span class="mitad-placeholder">👉</span>
              <span class="mitad-label">Derecha</span>
            {/if}
          </button>
        </div>

        <!-- Precio -->
        <div class="precio-preview">
          <span class="precio-label">💰 Precio:</span>
          <span class="precio-valor">{formatPrecio(precioFinal)}</span>
        </div>
      </div>

      <!-- Selector de lado activo -->
      <div class="lado-selector">
        <button
          class="lado-btn"
          class:active={seleccionandoLado === 'izquierda'}
          on:click={() => seleccionandoLado = 'izquierda'}
        >
          👈 Seleccionar izquierda
        </button>
        <button
          class="lado-btn"
          class:active={seleccionandoLado === 'derecha'}
          on:click={() => seleccionandoLado = 'derecha'}
        >
          👉 Seleccionar derecha
        </button>
      </div>

      <!-- Content: lista de pizzas -->
      <div class="panel-content">
        {#if loading}
          <div class="loading">⏳ Cargando pizzas...</div>
        {:else if error}
          <div class="error">❌ {error}</div>
        {:else if pizzas.length === 0}
          <div class="empty">🍕 No hay pizzas disponibles</div>
        {:else}
          <div class="pizzas-grid">
            {#each pizzas as pizza}
              {@const isSelectedIzq = pizzaIzquierda?.id === pizza.id}
              {@const isSelectedDer = pizzaDerecha?.id === pizza.id}
              <button
                class="pizza-btn"
                class:selected-izq={isSelectedIzq}
                class:selected-der={isSelectedDer}
                on:click={() => selectPizza(pizza)}
              >
                <span class="pizza-emoji">{pizza.emoji || '🍕'}</span>
                <span class="pizza-nombre">{pizza.nombre}</span>
                <span class="pizza-precio">{formatPrecio(pizza.precio)}</span>
                {#if isSelectedIzq}
                  <span class="pizza-badge izq">👈</span>
                {/if}
                {#if isSelectedDer}
                  <span class="pizza-badge der">👉</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        <button class="action-btn secondary" on:click={handleClose}>
          ↩️ Cancelar
        </button>
        <button
          class="action-btn primary"
          disabled={!seleccionCompleta}
          on:click={handleConfirm}
        >
          ✅ Añadir {seleccionCompleta ? formatPrecio(precioFinal) : ''}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
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
    max-width: 500px;
    max-height: 90vh;
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

  .header-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-icon {
    font-size: 1.5rem;
  }

  .header-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
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

  /* Preview section */
  .preview-section {
    padding: 20px 16px;
    background: linear-gradient(135deg, #1a1a1a 0%, #222 100%);
    border-bottom: 1px solid #333;
  }

  .pizza-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .mitad {
    flex: 1;
    max-width: 140px;
    padding: 16px 12px;
    border: 2px dashed #444;
    border-radius: 12px;
    background: #1a1a1a;
    color: #666;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    position: relative;
  }

  .mitad:hover {
    border-color: #555;
  }

  .mitad.active {
    border-color: #8b5cf6;
    border-style: solid;
    background: rgba(139, 92, 246, 0.1);
  }

  .mitad.selected {
    border-color: #22c55e;
    border-style: solid;
    background: rgba(34, 197, 94, 0.1);
    color: #fff;
  }

  .mitad-emoji {
    font-size: 2rem;
  }

  .mitad-placeholder {
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .mitad-nombre {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
  }

  .mitad-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mitad-clear {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 18px;
    height: 18px;
    background: #ef4444;
    border-radius: 50%;
    font-size: 0.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .divisor {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
  }

  .divisor-line {
    width: 2px;
    height: 20px;
    background: #444;
  }

  .divisor-icon {
    font-size: 1rem;
    color: #8b5cf6;
  }

  .precio-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    padding: 10px 16px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
  }

  .precio-label {
    font-size: 0.85rem;
    color: #888;
  }

  .precio-valor {
    font-size: 1.2rem;
    font-weight: 800;
    color: #22c55e;
  }

  /* Lado selector */
  .lado-selector {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: #1a1a1a;
    border-bottom: 1px solid #222;
  }

  .lado-btn {
    flex: 1;
    padding: 10px;
    border: 1px solid #333;
    border-radius: 8px;
    background: #222;
    color: #888;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .lado-btn:hover {
    background: #2a2a2a;
  }

  .lado-btn.active {
    background: rgba(139, 92, 246, 0.2);
    border-color: #8b5cf6;
    color: #8b5cf6;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    min-height: 200px;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 32px 16px;
    color: #666;
  }

  .error {
    color: #ef4444;
  }

  /* Pizzas grid */
  .pizzas-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .pizza-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 10px;
    border: 2px solid #333;
    border-radius: 12px;
    background: #1a1a1a;
    color: #ccc;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .pizza-btn:hover {
    border-color: #555;
    background: #222;
  }

  .pizza-btn.selected-izq {
    border-color: #8b5cf6;
    background: rgba(139, 92, 246, 0.15);
  }

  .pizza-btn.selected-der {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
  }

  .pizza-btn.selected-izq.selected-der {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
  }

  .pizza-emoji {
    font-size: 1.8rem;
  }

  .pizza-nombre {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
  }

  .pizza-precio {
    font-size: 0.7rem;
    color: #22c55e;
    font-weight: 700;
  }

  .pizza-badge {
    position: absolute;
    top: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pizza-badge.izq {
    left: 6px;
    background: #8b5cf6;
  }

  .pizza-badge.der {
    right: 6px;
    background: #f59e0b;
  }

  /* Footer */
  .panel-footer {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-top: 1px solid #222;
    background: #1a1a1a;
  }

  .action-btn {
    flex: 1;
    padding: 14px;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.primary {
    background: #22c55e;
    color: #fff;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #16a34a;
  }

  .action-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.secondary {
    background: #333;
    color: #ccc;
  }

  .action-btn.secondary:hover {
    background: #444;
  }

  /* Mobile */
  @media (max-width: 400px) {
    .pizzas-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .pizza-btn {
      padding: 10px 8px;
    }

    .pizza-emoji {
      font-size: 1.5rem;
    }

    .mitad {
      max-width: 110px;
      padding: 12px 8px;
    }

    .mitad-emoji {
      font-size: 1.5rem;
    }
  }
</style>
