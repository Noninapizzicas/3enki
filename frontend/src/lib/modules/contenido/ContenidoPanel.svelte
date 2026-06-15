<script lang="ts">
  /**
   * ContenidoPanel — gestión de imágenes por producto (pieza 4).
   * Lista los productos de la carta pública (proyección de carta-digital) y permite
   * subir/quitar imágenes. El reflejo de `contenido` nombra y persiste; la PWA las muestra.
   */
  import { onMount, onDestroy } from 'svelte';
  import { cartaPublica, loadCartaPublica, initCartaDigitalSubscriptions } from '$lib/stores/carta-digital';
  import { subirImagen, quitarImagen, contenidoBusy, contenidoError } from '$lib/stores/contenido';

  let cleanup: (() => void) | null = null;
  $: productos = $cartaPublica?.productos ?? [];

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
            <label class="subir">
              + Imagen
              <input type="file" accept="image/*" on:change={(e) => onFile(prod.id, e)} disabled={$contenidoBusy === prod.id} />
            </label>
          </div>
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
  .panel { padding: 1rem 1.25rem; }
  .hint { color: #888; font-size: 0.85rem; margin: 0 0 1rem; }
  .error { background: #fee; color: #b00; border: 1px solid #fcc; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }
  .lista { display: flex; flex-direction: column; gap: 0.75rem; }
  .producto { border: 1px solid #ddd; border-radius: 8px; padding: 0.6rem 0.8rem; }
  .producto.busy { opacity: 0.6; }
  .cabecera { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .nombre { font-weight: 600; }
  .subir { cursor: pointer; font-size: 0.8rem; border: 1px solid #aaa; border-radius: 6px; padding: 2px 8px; }
  .subir input { display: none; }
  .miniaturas { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .mini { position: relative; }
  .mini img { height: 56px; width: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #eee; display: block; }
  .mini.principal img { border-color: var(--color-accent, #eab308); }
  .badge { position: absolute; top: -6px; left: -6px; color: var(--color-accent, #eab308); font-size: 0.9rem; }
  .quitar { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; line-height: 1; border-radius: 50%; border: none; background: #b00; color: #fff; cursor: pointer; font-size: 0.8rem; padding: 0; }
  .sin-img { color: #aaa; font-size: 0.8rem; }
</style>
