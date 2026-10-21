<script lang="ts">
  /**
   * EditorFicha — forma `editor-bloque` del esquema-jefe: UN modal con la ficha
   * completa (nombre / descripcion / etiquetas / alergenos / categoria_id), un
   * solo submit → productos.update (delega al custodio carta.update_product).
   *
   * R6: los euros que se muestran no se editan aquí — el precio vive como
   * inline-gesture en la tarjeta (gesto rey).
   * R2: el resultado lo escribe la señal (carta.editada + catalogo.actualizado);
   * este modal no muta estado de catálogo, solo captura y delega.
   */

  import { categoriasStore } from './stores/productos';

  export let producto: Producto;
  export let busy = false;
  export let errorTurno: string | null = null;
  export let onCerrar: () => void;
  export let onGuardar: (id: string, campos: Record<string, unknown>) => void;

  interface CategoriaOpt {
    id: string;
    nombre: string;
    [key: string]: unknown;
  }

  interface Producto {
    id: string;
    nombre: string;
    descripcion?: string;
    etiquetas?: string[];
    alergenos?: string[];
    categoria_id?: string | null;
    categoria?: string | null;
    [key: string]: unknown;
  }

  // ---- borrador de captura (solo vive mientras el modal está abierto) ----
  let nombre = producto.nombre ?? '';
  let descripcion = producto.descripcion ?? '';
  let etiquetasTexto = (producto.etiquetas ?? []).join(', ');
  let alergenosTexto = (producto.alergenos ?? []).join(', ');
  let categoriaId = producto.categoria_id ?? producto.categoria ?? '';
  /** Error de validación local (no mutamos la prop errorTurno — es del panel). */
  let errorNombre: string | null = null;

  function cerrar(): void {
    if (!busy) onCerrar();
  }

  function onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) cerrar();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') cerrar();
  }

  function parseLista(texto: string): string[] {
    return texto
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function guardar(): void {
    errorNombre = null;
    if (!nombre.trim()) {
      errorNombre = 'El nombre no puede quedar vacío';
      return;
    }
    onGuardar(producto.id, {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      etiquetas: parseLista(etiquetasTexto),
      alergenos: parseLista(alergenosTexto),
      ...(categoriaId ? { categoria_id: categoriaId } : {})
    });
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div
  class="editor-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Editar ficha de {producto.nombre}"
  tabindex="-1"
  on:mousedown={onBackdrop}
>
  <div class="editor-bloque">
    <header class="editor-cabecera">
      <h3>✏️ Ficha · {producto.nombre}</h3>
      <button class="btn-cerrar" title="Cerrar (Esc)" on:click={cerrar}>✕</button>
    </header>

    <div class="editor-cuerpo">
      <label class="campo">
        <span>Nombre</span>
        <input type="text" bind:value={nombre} disabled={busy} maxlength="120" />
      </label>

      <label class="campo">
        <span>Descripción</span>
        <textarea bind:value={descripcion} rows="3" disabled={busy} maxlength="600"></textarea>
      </label>

      <label class="campo">
        <span>Categoría</span>
        <select bind:value={categoriaId} disabled={busy}>
          <option value="" disabled>selecciona categoría</option>
          {#each $categoriasStore as cat}
            <option value={cat.id}>{cat.nombre}</option>
          {/each}
        </select>
      </label>

      <label class="campo">
        <span>Etiquetas <small>(separadas por coma)</small></span>
        <input type="text" bind:value={etiquetasTexto} disabled={busy} placeholder="vegetariana, picante…" />
      </label>

      <label class="campo">
        <span>Alérgenos <small>(separados por coma)</small></span>
        <input type="text" bind:value={alergenosTexto} disabled={busy} placeholder="gluten, lácteos…" />
      </label>

      <p class="nota-precio">💰 El precio se edita EN VISTA, en la tarjeta (gesto inline).</p>

      {#if errorNombre}
        <div class="feedback error" role="alert">{errorNombre}</div>
      {:else if errorTurno}
        <div class="feedback error" role="alert">{errorTurno}</div>
      {/if}
    </div>

    <footer class="editor-pie">
      <button class="btn-secundario" disabled={busy} on:click={cerrar}>Cancelar</button>
      <button class="btn-primario" disabled={busy} on:click={guardar}>
        {busy ? 'Guardando…' : 'Guardar ficha'}
      </button>
    </footer>
  </div>
</div>

<style>
  .editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }
  .editor-bloque {
    display: flex;
    flex-direction: column;
    width: min(30rem, 92vw);
    max-height: 85vh;
    background: var(--color-panel-bg, #1a1a1e);
    border: 1px solid var(--color-border, #333);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  .editor-cabecera {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0.9rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .editor-cabecera h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text, #e4e4e7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn-cerrar {
    background: none;
    border: none;
    color: var(--color-text-muted, #888);
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    border-radius: 5px;
  }
  .btn-cerrar:hover {
    color: var(--color-text, #e4e4e7);
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.06));
  }
  .editor-cuerpo {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
    overflow-y: auto;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.74rem;
    color: var(--color-text-muted, #888);
  }
  .campo small {
    font-weight: 400;
    opacity: 0.8;
  }
  .campo input,
  .campo textarea,
  .campo select {
    background: var(--color-input-bg, rgba(0, 0, 0, 0.3));
    color: var(--color-text, #e4e4e7);
    border: 1px solid var(--color-border, #333);
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
    font-size: 0.82rem;
    font-family: inherit;
  }
  .campo input:focus,
  .campo textarea:focus,
  .campo select:focus {
    outline: none;
    border-color: var(--color-primary, #eab308);
  }
  .nota-precio {
    margin: 0;
    font-size: 0.7rem;
    color: var(--color-text-muted, #888);
  }
  .feedback.error {
    font-size: 0.74rem;
    color: var(--color-error, #ef4444);
  }
  .editor-pie {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--color-border, #333);
  }
  .btn-secundario,
  .btn-primario {
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    font-size: 0.78rem;
    cursor: pointer;
    border: 1px solid var(--color-border, #333);
  }
  .btn-secundario {
    background: none;
    color: var(--color-text-muted, #888);
  }
  .btn-secundario:hover {
    color: var(--color-text, #e4e4e7);
  }
  .btn-primario {
    background: var(--color-primary, #eab308);
    color: #18181b;
    border-color: var(--color-primary, #eab308);
    font-weight: 600;
  }
  .btn-primario:hover:not(:disabled) {
    background: var(--color-primary-hover, #ca8a04);
  }
  .btn-primario:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>