<script lang="ts">
  /**
   * MesaPicker — Selector de mesas por zona
   *
   * Muestra mesas disponibles agrupadas por zona (terraza, interior, vip).
   * Al seleccionar una mesa, llama a mesa.abrir via cuentas-canales.
   *
   * Layout:
   * ┌─────────────────────────────┐
   * │  Selecciona Mesa        [X] │
   * ├─────────────────────────────┤
   * │  TERRAZA                    │
   * │  [1] [2] [3] [4] [5]       │
   * │  [6] [7] [8] [9] [10]      │
   * │  INTERIOR                   │
   * │  [11] [12] [13] ...        │
   * │  VIP                        │
   * │  [21] [22] ...             │
   * └─────────────────────────────┘
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { getAvailableMesas, createMesa, type MesaDisponible } from '$lib/stores/cuentas';

  export let projectId: string;

  const dispatch = createEventDispatcher<{
    selected: { cuenta_id: string; numero_mesa: number };
    close: void;
  }>();

  let mesas: MesaDisponible[] = [];
  let loading = true;
  let creating = false;
  let error = '';

  // Agrupar por zona
  $: mesasPorZona = mesas.reduce((acc, m) => {
    if (!acc[m.zona]) acc[m.zona] = [];
    acc[m.zona].push(m);
    return acc;
  }, {} as Record<string, MesaDisponible[]>);

  $: zonas = Object.keys(mesasPorZona);

  const ZONA_LABELS: Record<string, string> = {
    terraza: 'Terraza',
    interior: 'Interior',
    vip: 'VIP'
  };

  const ZONA_ICONS: Record<string, string> = {
    terraza: '\u2600\uFE0F',
    interior: '\uD83C\uDFE0',
    vip: '\u2B50'
  };

  onMount(async () => {
    try {
      mesas = await getAvailableMesas(projectId);
    } catch (err: any) {
      error = 'Error cargando mesas';
    } finally {
      loading = false;
    }
  });

  async function handleSelectMesa(mesa: MesaDisponible) {
    if (creating) return;
    creating = true;
    error = '';

    try {
      const cuenta_id = await createMesa(projectId, mesa.numero_mesa);
      if (cuenta_id) {
        dispatch('selected', { cuenta_id, numero_mesa: mesa.numero_mesa });
      } else {
        error = 'Error al abrir mesa';
        setTimeout(() => error = '', 3000);
      }
    } catch (err: any) {
      error = err.message || 'Error';
      setTimeout(() => error = '', 3000);
    } finally {
      creating = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="mesa-picker-overlay" on:click|self={handleClose}>
  <div class="mesa-picker">
    <!-- Header -->
    <div class="picker-header">
      <h2>Selecciona Mesa</h2>
      <button class="close-btn" on:click={handleClose}>&times;</button>
    </div>

    <!-- Content -->
    <div class="picker-body">
      {#if loading}
        <div class="loading-state">Cargando mesas...</div>
      {:else if mesas.length === 0}
        <div class="empty-state">No hay mesas disponibles</div>
      {:else}
        {#each zonas as zona}
          <div class="zona-group">
            <div class="zona-header">
              <span class="zona-icon">{ZONA_ICONS[zona] || ''}</span>
              <span class="zona-label">{ZONA_LABELS[zona] || zona}</span>
              <span class="zona-count">{mesasPorZona[zona].length}</span>
            </div>
            <div class="mesas-grid">
              {#each mesasPorZona[zona].sort((a, b) => a.numero_mesa - b.numero_mesa) as mesa}
                <button
                  class="mesa-btn"
                  class:creating
                  disabled={creating}
                  on:click={() => handleSelectMesa(mesa)}
                  title="Mesa {mesa.numero_mesa} ({mesa.capacidad} plazas)"
                >
                  <span class="mesa-num">{mesa.numero_mesa}</span>
                  <span class="mesa-cap">{mesa.capacidad}p</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}

      {#if error}
        <div class="error-msg">{error}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .mesa-picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
  }

  .mesa-picker {
    width: 90vw;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: #111;
    border: 1px solid #333;
    border-radius: 16px;
    overflow: hidden;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: #1a1a1a;
    border-bottom: 1px solid #333;
  }

  .picker-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: #333;
    color: #aaa;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .close-btn:active {
    background: #555;
  }

  .picker-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .zona-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zona-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #222;
  }

  .zona-icon {
    font-size: 0.9rem;
  }

  .zona-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    flex: 1;
  }

  .zona-count {
    font-size: 0.65rem;
    color: #555;
    background: #1a1a1a;
    padding: 1px 6px;
    border-radius: 8px;
  }

  .mesas-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  .mesa-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 10px 4px;
    border: 2px solid #3b82f6;
    border-radius: 10px;
    background: color-mix(in srgb, #3b82f6 8%, transparent);
    color: #3b82f6;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .mesa-btn:active:not(:disabled) {
    transform: scale(0.92);
    background: color-mix(in srgb, #3b82f6 25%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, #3b82f6 30%, transparent);
  }

  .mesa-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mesa-btn.creating {
    animation: pulse-mesa 0.6s ease-in-out infinite;
  }

  .mesa-num {
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1;
  }

  .mesa-cap {
    font-size: 0.55rem;
    color: rgba(59, 130, 246, 0.6);
    text-transform: uppercase;
  }

  .loading-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: #555;
    font-size: 0.9rem;
  }

  .error-msg {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    font-size: 0.8rem;
    text-align: center;
  }

  @keyframes pulse-mesa {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 400px) {
    .mesas-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
</style>
