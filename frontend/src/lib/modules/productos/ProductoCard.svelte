<script lang="ts">
  /**
   * ProductoCard — la tarjeta es el formulario de lo frecuente (esquema-jefe,
   * principio 3). Formas canónicas que sirve:
   *
   *   inline-gesture · toggle disponible — 1 toque, feedback óptico inmediato;
   *     el dictamen llega por señal (la store re-lee; nada de estado local asumido).
   *   inline-gesture · precio (EL GESTO REY) — toque → cifra → Enter; eco del valor
   *     anterior; validación no-negativa nombrada EN la tarjeta (nada de toasts).
   *   editor-bloque + confirmador-nombrado — delegados al panel via callbacks.
   *
   * R4: disponible (negocio) ≠ activo (estructura). Este componente SOLO toca disponible.
   * R2: tras cada mutación el estado lo escribe la señal (productos store) — aquí solo
   *     vive el micro-estado de la captura (input abierto, error de validación).
   */

  import { formatearPrecio } from '../stores/productos';

  export let producto: Producto;
  export let busy = false;
  export let errorTurno: string | null = null;
  export let onToggleDisponible: (id: string, disponible: boolean) => void;
  export let onPrecioConfirmado: (id: string, precio: number) => void;
  export let onEditarFicha: (p: Producto) => void;
  export let onRetirar: (p: Producto) => void;

  interface Producto {
    id: string;
    nombre: string;
    precio: number;
    categoria?: string | null;
    descripcion?: string;
    etiquetas?: string[];
    disponible?: boolean;
    [key: string]: unknown;
  }

  // ---- micro-estado de captura (solo UI de captura, NO datos de catálogo) ----
  let editandoPrecio = false;
  let precioBorrador = '';
  let errorPrecio: string | null = null;
  /** Eco nombrado del valor anterior tras guardar (p.ej. "era 9,50 €"). */
  let ecoPrecioAnterior: string | null = null;

  const esDisponible = (): boolean => producto.disponible !== false;

  function abrirEditorPrecio(): void {
    precioBorrador = String(producto.precio ?? '').replace('.', ',');
    errorPrecio = null;
    ecoPrecioAnterior = null;
    editandoPrecio = true;
    // foco + selección completa en el siguiente tick (el input se acaba de montar)
    setTimeout(() => {
      const input = cardEl?.querySelector<HTMLInputElement>('.precio-input');
      input?.focus();
      input?.select();
    }, 0);
  }

  function cerrarEditorPrecio(): void {
    editandoPrecio = false;
    errorPrecio = null;
  }

  function confirmarPrecio(): void {
    if (!editandoPrecio) return; // ya cerrado (Enter/Escape dispararon blur) — evitar doble mutación
    const n = Number(precioBorrador.replace(',', '.'));
    if (precioBorrador.trim() === '' || !Number.isFinite(n)) {
      errorPrecio = 'escribe una cifra válida';
      return;
    }
    if (n < 0) {
      errorPrecio = 'el precio no puede ser negativo';
      return;
    }
    editandoPrecio = false;
    errorPrecio = null;
    if (n === producto.precio) return; // sin cambio real — sin ruido
    ecoPrecioAnterior = formatearPrecio(producto.precio);
    onPrecioConfirmado(producto.id, n);
    // el eco se apaga con la llegada de la señal (reacción) o a los 6s por si falla la señal
    if (ecoTimer) clearTimeout(ecoTimer);
    ecoTimer = setTimeout(() => (ecoPrecioAnterior = null), 6000);
  }

  let ecoTimer: ReturnType<typeof setTimeout> | null = null;

  function onPrecioKey(e: KeyboardEvent): void {
    e.stopPropagation(); // el panel no debe capturar teclas de la captura
    if (e.key === 'Enter') confirmarPrecio();
    else if (e.key === 'Escape') {
      ecoTimer && clearTimeout(ecoTimer);
      cerrarEditorPrecio();
    }
  }

  let cardEl: HTMLElement | null = null;

  function manejarToggle(): void {
    ecoPrecioAnterior = null;
    onToggleDisponible(producto.id, !esDisponible());
  }
</script>

<div class="producto-card" class:no-disponible={!esDisponible()} bind:this={cardEl}>
  <div class="cabecera">
    <span class="nombre" title={producto.nombre}>{producto.nombre}</span>
    <!-- ⭐ GESTO REY — precio inline-gesture -->
    {#if editandoPrecio}
      <input
        class="precio-input"
        type="text"
        inputmode="decimal"
        bind:value={precioBorrador}
        on:keydown={onPrecioKey}
        on:blur={confirmarPrecio}
        aria-label="Nuevo precio de {producto.nombre}"
      />
    {:else}
      <button
        class="precio"
        title="Toque para editar el precio (Enter para confirmar)"
        on:click={abrirEditorPrecio}
      >
        {formatearPrecio(producto.precio)}
      </button>
    {/if}
  </div>

  {#if producto.descripcion}
    <p class="descripcion" title={producto.descripcion}>{producto.descripcion}</p>
  {/if}

  {#if producto.etiquetas?.length || producto.alergenos?.length}
    <div class="chips">
      {#each producto.etiquetas ?? [] as et}
        <span class="chip etiqueta">{et}</span>
      {/each}
      {#each producto.alergenos ?? [] as al}
        <span class="chip alergeno" title="Alérgeno">{al}</span>
      {/each}
    </div>
  {/if}

  {#if ecoPrecioAnterior}
    <div class="eco" role="status">era {ecoPrecioAnterior}</div>
  {/if}
  {#if errorPrecio}
    <div class="feedback error" role="alert">{errorPrecio}</div>
  {/if}
  {#if errorTurno}
    <div class="feedback error" role="alert">{errorTurno}</div>
  {/if}

  <div class="pie">
    <!-- ⭐ TOGGLE disponible — inline-gesture de 1 toque -->
    <button
      class="toggle-disponible"
      class:on={esDisponible()}
      disabled={busy}
      title={esDisponible() ? 'Disponible — toque para marcar NO disponible' : 'No disponible — toque para marcar disponible'}
      on:click={manejarToggle}
    >
      <span class="knob" aria-hidden="true"></span>
      <span class="toggle-label">{esDisponible() ? 'Disponible' : 'No disp.'}</span>
    </button>

    <div class="acciones">
      <button class="btn-accion" disabled={busy} title="Editar ficha" on:click={() => onEditarFicha(producto)}>
        ✏️
      </button>
      <button
        class="btn-accion retirar"
        disabled={busy}
        title="Retirar del catálogo"
        on:click={() => onRetirar(producto)}
      >
        🗑️
      </button>
    </div>
  </div>

  {#if busy}
    <div class="busy-veil" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .producto-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    transition: opacity 0.2s ease;
  }
  .producto-card.no-disponible {
    opacity: 0.55;
  }

  .cabecera {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }
  .nombre {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--color-text, #e4e4e7);
    overflow: hidden;
    text-overflow: ellipsis;
   white-space: nowrap;
  }
  .precio,
  .precio-input {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .precio {
    background: none;
    border: none;
    color: var(--color-primary, #eab308);
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    border-radius: 5px;
    border-bottom: 1px dashed transparent;
  }
  .precio:hover {
    border-bottom-color: var(--color-primary, #eab308);
  }
  .precio-input {
    width: 5.5rem;
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-primary, #eab308);
    border-radius: 5px;
    padding: 0.15rem 0.35rem;
    text-align: right;
    font-size: 0.9rem;
  }

  .descripcion {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    font-size: 0.62rem;
    padding: 0.08rem 0.4rem;
    border-radius: 999px;
    border: 1px solid var(--color-border, #333);
    color: var(--color-text-muted, #888);
  }
  .chip.alergeno {
    border-color: var(--color-warning, #f59e0b);
    color: var(--color-warning, #f59e0b);
  }

  .eco {
    font-size: 0.68rem;
    color: var(--color-text-muted, #888);
    font-style: italic;
  }
  .feedback {
    font-size: 0.7rem;
  }
  .feedback.error {
    color: var(--color-error, #ef4444);
  }

  .pie {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
  }

  /* toggle — interruptor compacto (R4: disponible, nunca activo) */
  .toggle-disponible {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: none;
    border: 1px solid var(--color-border, #333);
    border-radius: 999px;
    padding: 0.12rem 0.45rem 0.12rem 0.12rem;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  .toggle-disponible.on {
    border-color: var(--color-success, #22c55e);
  }
  .toggle-disponible .knob {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    background: var(--color-border, #555);
    transition: background 0.15s ease;
  }
  .toggle-disponible.on .knob {
    background: var(--color-success, #22c55e);
  }
  .toggle-disponible .toggle-label {
    font-size: 0.66rem;
    color: var(--color-text-muted, #888);
  }
  .toggle-disponible.on .toggle-label {
    color: var(--color-success, #22c55e);
  }
  .toggle-disponible:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .acciones {
    display: flex;
    gap: 0.25rem;
  }
  .btn-accion {
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
    cursor: pointer;
    opacity: 0.75;
  }
  .btn-accion:hover {
    opacity: 1;
    border-color: var(--color-border, #333);
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.06));
  }
  .btn-accion.retirar:hover {
    border-color: var(--color-error, #ef4444);
  }

  .busy-veil {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    background: transparent;
    cursor: wait;
  }
</style>