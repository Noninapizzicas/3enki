<script lang="ts">
  /**
   * AlGustoPanel — Flotante para crear pizza personalizada
   *
   * - Carga ingredientes desde ingredientes.list
   * - Agrupa por tipo (base, salsa, queso, proteína, vegetal...)
   * - Selección múltiple con precio acumulado
   * - Precio = base + suma de ingredientes
   *
   * Usa módulo: ingredientes
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;
  export let precioBase: number = 8.00; // Precio base pizza al gusto

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: {
      ingredientes: Ingrediente[];
      precio_total: number;
      nombre_compuesto: string;
    };
  }>();

  interface Ingrediente {
    id: string;
    nombre: string;
    emoji?: string;
    tipo: string;
    precio_extra: number;
    es_alergeno?: boolean;
    alergenos?: string[];
  }

  // Estado
  let loading = true;
  let error: string | null = null;

  // Ingredientes agrupados por tipo
  let ingredientesPorTipo: Map<string, Ingrediente[]> = new Map();
  let tiposOrden: string[] = [];

  // Selección del usuario
  let seleccionados: Map<string, Ingrediente> = new Map();

  // Config de tipos
  const tipoConfig: Record<string, { emoji: string; label: string; orden: number }> = {
    base: { emoji: '🫓', label: 'Base', orden: 1 },
    salsa: { emoji: '🍅', label: 'Salsa', orden: 2 },
    queso: { emoji: '🧀', label: 'Queso', orden: 3 },
    proteina: { emoji: '🥓', label: 'Proteína', orden: 4 },
    carne: { emoji: '🍖', label: 'Carne', orden: 4 },
    vegetal: { emoji: '🥬', label: 'Vegetal', orden: 5 },
    verdura: { emoji: '🥬', label: 'Verdura', orden: 5 },
    fruta: { emoji: '🍍', label: 'Fruta', orden: 6 },
    extra: { emoji: '✨', label: 'Extra', orden: 7 },
    condimento: { emoji: '🧂', label: 'Condimento', orden: 8 },
    otro: { emoji: '📦', label: 'Otro', orden: 9 }
  };

  // Cálculos
  $: precioIngredientes = calcularPrecioIngredientes();
  $: precioTotal = precioBase + precioIngredientes;
  $: nombreCompuesto = generarNombre();
  $: cantidadSeleccionados = seleccionados.size;

  function calcularPrecioIngredientes(): number {
    let total = 0;
    seleccionados.forEach(ing => {
      total += ing.precio_extra || 0;
    });
    return total;
  }

  function generarNombre(): string {
    if (seleccionados.size === 0) return 'Pizza Al Gusto';

    const nombres = Array.from(seleccionados.values())
      .slice(0, 3)
      .map(i => i.nombre);

    if (seleccionados.size > 3) {
      return `Pizza: ${nombres.join(', ')}...`;
    }
    return `Pizza: ${nombres.join(', ')}`;
  }

  async function loadIngredientes() {
    loading = true;
    error = null;

    try {
      const res = await mqttRequest('ingredientes', 'list', {});

      if (res?.status === 200 && res?.data?.ingredientes) {
        const ingredientes: Ingrediente[] = res.data.ingredientes
          .filter((i: any) => i.disponible !== false);

        // Agrupar por tipo
        ingredientesPorTipo = new Map();

        ingredientes.forEach(ing => {
          const tipo = (ing.tipo || 'otro').toLowerCase();
          if (!ingredientesPorTipo.has(tipo)) {
            ingredientesPorTipo.set(tipo, []);
          }
          ingredientesPorTipo.get(tipo)!.push(ing);
        });

        // Ordenar ingredientes dentro de cada tipo
        ingredientesPorTipo.forEach((lista, tipo) => {
          lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
        });

        // Ordenar tipos
        tiposOrden = Array.from(ingredientesPorTipo.keys()).sort((a, b) => {
          const ordenA = tipoConfig[a]?.orden || 99;
          const ordenB = tipoConfig[b]?.orden || 99;
          return ordenA - ordenB;
        });

      } else {
        error = res?.error || 'Error al cargar ingredientes';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  function toggleIngrediente(ing: Ingrediente) {
    if (seleccionados.has(ing.id)) {
      seleccionados.delete(ing.id);
    } else {
      seleccionados.set(ing.id, ing);
    }
    seleccionados = new Map(seleccionados); // trigger reactivity
  }

  function limpiarSeleccion() {
    seleccionados = new Map();
  }

  function handleConfirm() {
    if (seleccionados.size === 0) return;

    dispatch('confirm', {
      ingredientes: Array.from(seleccionados.values()),
      precio_total: precioTotal,
      nombre_compuesto: nombreCompuesto
    });
  }

  function handleClose() {
    dispatch('close');
  }

  function formatPrecio(precio: number): string {
    return precio.toFixed(2) + ' €';
  }

  function getTipoInfo(tipo: string) {
    return tipoConfig[tipo] || tipoConfig['otro'];
  }

  onMount(() => {
    loadIngredientes();
  });
</script>

{#if visible}
  <div class="overlay" on:click={handleClose} on:keydown={(e) => e.key === 'Escape' && handleClose()}>
    <div class="panel" on:click|stopPropagation>
      <!-- Header -->
      <header class="panel-header">
        <div class="header-info">
          <span class="header-icon">🎨</span>
          <span class="header-title">Pizza Al Gusto</span>
        </div>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>

      <!-- Precio preview -->
      <div class="precio-section">
        <div class="precio-row">
          <span class="precio-label">🍕 Base</span>
          <span class="precio-valor">{formatPrecio(precioBase)}</span>
        </div>
        {#if precioIngredientes > 0}
          <div class="precio-row extras">
            <span class="precio-label">✨ Ingredientes ({cantidadSeleccionados})</span>
            <span class="precio-valor">+{formatPrecio(precioIngredientes)}</span>
          </div>
        {/if}
        <div class="precio-row total">
          <span class="precio-label">💰 Total</span>
          <span class="precio-valor">{formatPrecio(precioTotal)}</span>
        </div>
      </div>

      <!-- Content: ingredientes por tipo -->
      <div class="panel-content">
        {#if loading}
          <div class="loading">⏳ Cargando ingredientes...</div>
        {:else if error}
          <div class="error">❌ {error}</div>
        {:else}
          {#each tiposOrden as tipo}
            {@const tipoInfo = getTipoInfo(tipo)}
            {@const ingredientes = ingredientesPorTipo.get(tipo) || []}
            <section class="tipo-section">
              <h3 class="tipo-header">
                <span class="tipo-emoji">{tipoInfo.emoji}</span>
                <span class="tipo-label">{tipoInfo.label}</span>
                <span class="tipo-count">({ingredientes.length})</span>
              </h3>
              <div class="ingredientes-grid">
                {#each ingredientes as ing}
                  {@const isSelected = seleccionados.has(ing.id)}
                  <button
                    class="ingrediente-btn"
                    class:selected={isSelected}
                    on:click={() => toggleIngrediente(ing)}
                  >
                    <span class="ing-emoji">{ing.emoji || '•'}</span>
                    <span class="ing-nombre">{ing.nombre}</span>
                    {#if ing.precio_extra > 0}
                      <span class="ing-precio">+{ing.precio_extra.toFixed(2)}</span>
                    {:else}
                      <span class="ing-precio gratis">gratis</span>
                    {/if}
                    {#if ing.es_alergeno || (ing.alergenos && ing.alergenos.length > 0)}
                      <span class="ing-alergeno">⚠️</span>
                    {/if}
                    {#if isSelected}
                      <span class="ing-check">✓</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        {/if}
      </div>

      <!-- Selección actual -->
      {#if cantidadSeleccionados > 0}
        <div class="seleccion-bar">
          <div class="seleccion-chips">
            {#each Array.from(seleccionados.values()).slice(0, 5) as ing}
              <span class="chip">
                {ing.emoji || '•'} {ing.nombre}
              </span>
            {/each}
            {#if cantidadSeleccionados > 5}
              <span class="chip more">+{cantidadSeleccionados - 5}</span>
            {/if}
          </div>
          <button class="clear-btn" on:click={limpiarSeleccion}>
            🗑️ Limpiar
          </button>
        </div>
      {/if}

      <!-- Footer -->
      <footer class="panel-footer">
        <button class="action-btn secondary" on:click={handleClose}>
          ↩️ Cancelar
        </button>
        <button
          class="action-btn primary"
          disabled={cantidadSeleccionados === 0}
          on:click={handleConfirm}
        >
          ✅ Añadir {formatPrecio(precioTotal)}
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
    max-width: 520px;
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

  /* Precio section */
  .precio-section {
    padding: 12px 16px;
    background: linear-gradient(135deg, #1a1a1a 0%, #222 100%);
    border-bottom: 1px solid #333;
  }

  .precio-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 0.85rem;
    color: #888;
  }

  .precio-row.extras {
    color: #22c55e;
  }

  .precio-row.total {
    border-top: 1px solid #333;
    margin-top: 8px;
    padding-top: 8px;
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }

  .precio-row.total .precio-valor {
    color: #22c55e;
    font-size: 1.2rem;
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    min-height: 200px;
  }

  .loading,
  .error {
    text-align: center;
    padding: 32px 16px;
    color: #666;
  }

  .error {
    color: #ef4444;
  }

  /* Tipo section */
  .tipo-section {
    margin-bottom: 20px;
  }

  .tipo-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #222;
  }

  .tipo-emoji {
    font-size: 1.1rem;
  }

  .tipo-label {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
  }

  .tipo-count {
    font-size: 0.7rem;
    color: #555;
  }

  /* Ingredientes grid */
  .ingredientes-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .ingrediente-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    border: 2px solid #333;
    border-radius: 10px;
    background: #1a1a1a;
    color: #ccc;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .ingrediente-btn:hover {
    border-color: #555;
    background: #222;
  }

  .ingrediente-btn.selected {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .ing-emoji {
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .ing-nombre {
    flex: 1;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ing-precio {
    font-size: 0.65rem;
    color: #22c55e;
    font-weight: 700;
    flex-shrink: 0;
  }

  .ing-precio.gratis {
    color: #888;
    font-weight: 400;
  }

  .ing-alergeno {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.6rem;
  }

  .ing-check {
    position: absolute;
    bottom: 4px;
    right: 6px;
    font-size: 0.7rem;
    color: #22c55e;
    font-weight: 700;
  }

  /* Selección bar */
  .seleccion-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: #1a1a1a;
    border-top: 1px solid #333;
  }

  .seleccion-chips {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    overflow: hidden;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(34, 197, 94, 0.2);
    border-radius: 12px;
    font-size: 0.65rem;
    color: #22c55e;
    white-space: nowrap;
  }

  .chip.more {
    background: rgba(139, 92, 246, 0.2);
    color: #8b5cf6;
  }

  .clear-btn {
    padding: 6px 10px;
    border: 1px solid #444;
    border-radius: 6px;
    background: transparent;
    color: #888;
    font-size: 0.7rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .clear-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: #ef4444;
    color: #ef4444;
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
    .ingredientes-grid {
      grid-template-columns: 1fr;
    }

    .ingrediente-btn {
      padding: 8px 10px;
    }
  }
</style>
