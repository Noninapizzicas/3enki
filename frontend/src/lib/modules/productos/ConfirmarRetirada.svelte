<script lang="ts">
  /**
   * ConfirmarRetirada — forma `confirmador-nombrado` del esquema-jefe: el modal
   * NOMBRA qué producto se retira (nombre + precio + impacto) antes de ejecutar.
   *
   * Default recomendado: DESACTIVAR (update disponible=false) — la retirada
   * estacional no borra historia ([ABIERTO] b del esquema: lógico vs físico).
   * Borrar es la opción secundaria explícita → productos.delete.
   * R2: ninguna vista del catálogo se muta aquí; la señal refresca todo.
   */

  import { formatearPrecio } from './stores/productos';

  export let producto: Producto;
  export let busy = false;
  export let errorTurno: string | null = null;
  export let onCerrar: () => void;
  export let onConfirmarDesactivar: (id: string) => void;
  export let onConfirmarBorrar: (id: string) => void;

  interface Producto {
    id: string;
    nombre: string;
    precio: number;
    disponible?: boolean;
    [key: string]: unknown;
  }

  const yaNoDisponible = producto.disponible === false;

  function cerrar(): void {
    if (!busy) onCerrar();
  }

  function onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) cerrar();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') cerrar();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div
  class="retirada-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Retirar {producto.nombre}"
  tabindex="-1"
  on:mousedown={onBackdrop}
>
  <div class="confirmador">
    <header class="cabecera">
      <h3>🗑️ Retirar producto</h3>
      <button class="btn-cerrar" title="Cerrar (Esc)" on:click={cerrar}>✕</button>
    </header>

    <div class="cuerpo">
      <p class="nombrado">
        Vas a retirar <strong>{producto.nombre}</strong>
        de <strong>{formatearPrecio(producto.precio)}</strong> del catálogo.
      </p>
      <p class="impacto">
        {#if yaNoDisponible}
          Este producto ya está marcado como no disponible.
        {:else}
          Deja de venderse en cuanto el catálogo se refresque (dejará de salir en POS y carta).
        {/if}
      </p>

      <div class="opciones">
        <button class="opcion principal" disabled={busy} on:click={() => onConfirmarDesactivar(producto.id)}>
          <span class="op-icono">🌙</span>
          <span class="op-texto">
            <strong>Desactivar</strong>
            <small>Recomendado — disponible=false; retorno estacional sin borrar historia</small>
          </span>
        </button>
        <button class="opcion peligrosa" disabled={busy} on:click={() => onConfirmarBorrar(producto.id)}>
          <span class="op-icono">🔥</span>
          <span class="op-texto">
            <strong>Borrar del catálogo</strong>
            <small>Definitivo — elimina el producto de la carta (no recomendado)</small>
          </span>
        </button>
      </div>

      {#if errorTurno}
        <div class="feedback error" role="alert">{errorTurno}</div>
      {/if}
    </div>

    <footer class="pie">
      <button class="btn-secundario" disabled={busy} on:click={cerrar}>Cancelar</button>
    </footer>
  </div>
</div>

<style>
  .retirada-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }
  .confirmador {
    display: flex;
    flex-direction: column;
    width: min(24rem, 92vw);
    background: var(--color-panel-bg, #1a1a1e);
    border: 1px solid var(--color-border, #333);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  .cabecera {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .cabecera h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text, #e4e4e7);
  }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    border-radius: 5px;
  }
  .btn-cerrar:hover {
    color: var(--color-text, #e4e4e7);
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.06));
  }
  .cuerpo {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
  }
  .nombrado {
    margin: 0;
    font-size: 0.84rem;
    color: var(--color-text, #e4e4e7);
  }
  .nombrado strong {
    color: var(--color-warning, #f59e0b);
  }
  .impacto {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-muted, #888);
  }
  .opciones {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .opcion {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    text-align: left;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--color-border, #333);
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    cursor: pointer;
  }
  .opcion:hover:not(:disabled) {
    border-color: var(--color-border, #555);
  }
  .opcion.principal:hover:not(:disabled) {
    border-color: var(--color-success, #22c55e);
  }
  .opcion.peligrosa:hover:not(:disabled) {
    border-color: var(--color-error, #ef4444);
  }
  .opcion:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .op-icono {
    font-size: 1rem;
  }
  .op-texto {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .op-texto strong {
    font-size: 0.8rem;
    color: var(--color-text, #e4e4e7);
  }
  .op-texto small {
    font-size: 0.68rem;
    color: var(--color-text-muted, #888);
  }
  .feedback.error {
    font-size: 0.74rem;
    color: var(--color-error, #ef4444);
  }
  .pie {
    display: flex;
    justify-content: flex-end;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--color-border, #333);
  }
  .btn-secundario {
    background: none;
    color: var(--color-text-muted, #888);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .btn-secundario:hover {
    color: var(--color-text, #e4e4e7);
  }
</style>