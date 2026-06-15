<script lang="ts">
  /**
   * ContenidoPanel — gestión de imágenes por producto (pieza 4).
   * Lista los productos de la carta pública (proyección de carta-digital) y permite
   * subir/quitar imágenes. El reflejo de `contenido` nombra y persiste; la PWA las muestra.
   */
  import { onMount, onDestroy } from 'svelte';
  import { cartaPublica, loadCartaPublica, initCartaDigitalSubscriptions } from '$lib/stores/carta-digital';
  import { subirImagen, quitarImagen, contenidoBusy, contenidoError } from '$lib/stores/contenido';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let cleanup: (() => void) | null = null;
  $: productos = $cartaPublica?.productos ?? [];

  // Convoca al COPYWRITER (cajón redactar_descripcion): prefill del chat; el usuario
  // puede concretar el brief del especialista antes de enviar.
  function convocarCopywriter(prod: any) {
    prefillChatInput(
      `Como copywriter, redacta la descripción del producto "${prod.nombre}" (id: ${prod.id}) en la voz de marca. ` +
      `[opcional: concreta el especialista — p.ej. "tono irónico de barrio" o "registro Michelin"]`
    );
  }

  // Convoca al DISEÑADOR GRÁFICO (cajón generar_imagen): redacta el prompt visual y pide
  // la foto al líder generador. Requiere motor+credencial (si no, devuelve error claro).
  function convocarDisenador(prod: any) {
    prefillChatInput(
      `Como diseñador gráfico, genera una imagen del producto "${prod.nombre}" (id: ${prod.id}) en la línea visual de la marca. ` +
      `[opcional: concreta el estilo fotográfico — p.ej. "cenital fondo oscuro" o "bodegón rústico con luz natural"]`
    );
  }

  onMount(() => {
    loadCartaPublica();
    cleanup = initCartaDigitalSubscriptions();
  });
  onDestroy(() => cleanup?.());

  async function onFile(productId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const principal = !(($cartaPublica?.productos.find((p: any) => p.id === productId)?.imagenes || []).length);
    contenidoBusy.set(productId);
    const ok = await subirImagen(productId, file, principal);
    if (ok) await loadCartaPublica();
    contenidoBusy.set(null);
    input.value = '';
  }

  async function onQuitar(productId: string, imagenId: string) {
    contenidoBusy.set(productId);
    const ok = await quitarImagen(productId, imagenId);
    if (ok) await loadCartaPublica();
    contenidoBusy.set(null);
  }
</script>

<section class="panel">
  <h2>Imágenes de los productos</h2>
  <p class="hint">Sube fotos a cada producto. Las muestra la carta pública (digital) — el POS no las usa.</p>

  {#if $contenidoError}
    <div class="error">{$contenidoError}</div>
  {/if}

  {#if productos.length === 0}
    <p class="hint">No hay productos. Asigna una carta al canal digital (tarifas) o ten una carta en servicio.</p>
  {:else}
    <div class="lista">
      {#each productos as prod}
        <div class="producto" class:busy={$contenidoBusy === prod.id}>
          <div class="cabecera">
            <span class="nombre">{prod.nombre}</span>
            <div class="acciones-prod">
              <button class="copy-btn" title="Redactar descripción (copywriter)" on:click={() => convocarCopywriter(prod)}>✍️ Descripción</button>
              <button class="copy-btn" title="Generar imagen (diseñador gráfico)" on:click={() => convocarDisenador(prod)}>🎨 Imagen IA</button>
              <label class="subir">
                + Subir
                <input type="file" accept="image/*" on:change={(e) => onFile(prod.id, e)} disabled={$contenidoBusy === prod.id} />
              </label>
            </div>
          </div>
          {#if prod.descripcion}
            <p class="descripcion">{prod.descripcion}</p>
          {:else}
            <p class="descripcion vacia">Sin descripción — convoca al copywriter ✍️</p>
          {/if}
          <div class="miniaturas">
            {#each (prod.imagenes || []) as img}
              <div class="mini" class:principal={img.principal}>
                <img src={img.url} alt={img.alt || prod.nombre} />
                {#if img.principal}<span class="badge">★</span>{/if}
                <button class="quitar" title="Quitar" on:click={() => onQuitar(prod.id, img.id)} disabled={$contenidoBusy === prod.id}>×</button>
              </div>
            {/each}
            {#if (prod.imagenes || []).length === 0}
              <span class="sin-img">sin imágenes</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel { padding: 1rem 1.25rem; color: var(--color-text, #e5e5e5); }
  .hint { color: var(--color-text-muted, #888); font-size: 0.85rem; margin: 0 0 1rem; }
  .error { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }
  .lista { display: flex; flex-direction: column; gap: 0.75rem; }
  .producto { border: 1px solid var(--color-border, #333); border-radius: 8px; padding: 0.6rem 0.8rem; background: var(--color-surface, #1a1a1a); }
  .producto.busy { opacity: 0.6; }
  .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
  .nombre { font-weight: 600; }
  .acciones-prod { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  .copy-btn { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 2px 8px; background: var(--color-surface-2, #222); color: var(--color-text, #e5e5e5); }
  .copy-btn:hover { border-color: var(--color-primary, #f59e0b); }
  .descripcion { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--color-text-muted, #aaa); line-height: 1.35; }
  .descripcion.vacia { font-style: italic; color: var(--color-text-muted, #666); }
  .subir { cursor: pointer; font-size: 0.75rem; border: 1px solid var(--color-border, #333); border-radius: 6px; padding: 2px 8px; background: var(--color-surface-2, #222); color: var(--color-text, #e5e5e5); }
  .subir input { display: none; }
  .miniaturas { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .mini { position: relative; }
  .mini img { height: 56px; width: 56px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border, #333); display: block; }
  .mini.principal img { border-color: var(--color-accent, #eab308); }
  .badge { position: absolute; top: -6px; left: -6px; color: var(--color-accent, #eab308); font-size: 0.9rem; }
  .quitar { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; line-height: 1; border-radius: 50%; border: none; background: #b00; color: #fff; cursor: pointer; font-size: 0.8rem; padding: 0; }
  .sin-img { color: var(--color-text-muted, #888); font-size: 0.8rem; }
</style>
