<script lang="ts">
  /**
   * CartaPublicaZone — la carta pública PROYECTADA (lo que ve el cliente), viva.
   * Ya no hay snapshot ni "desfasada": se proyecta al vuelo (carta+marca+contenido).
   * "Publicar" dispara el deploy a la PWA (cf-worker) vía chat.
   */
  import { cartaPublica } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expandedProducto: string | null = null;

  $: carta = $cartaPublica;
  $: categorias = carta?.categorias ?? [];
  $: productos = carta?.productos ?? [];

  function productosDe(cat: any) {
    return productos.filter((p: any) => p.categoria_id === cat.id || p.categoria === cat.nombre || p.categoria === cat.id);
  }
  function toggleProducto(id: string) {
    expandedProducto = expandedProducto === id ? null : id;
  }
  function publicar() {
    prefillChatInput('Publica la carta digital: genera el bundle de la PWA con la carta pública actual y despliégalo a /shop/<slug>.');
  }
</script>

<section class="zona-carta-publica">
  <h2>Carta pública (lo que ve el cliente)</h2>

  {#if !carta || categorias.length === 0}
    <div class="empty-state">
      <p>El canal digital no tiene carta que mostrar.</p>
      <p class="hint">Asigna una carta al canal <strong>digital</strong> en tarifas (o ten una carta en servicio).</p>
    </div>
  {:else}
    <p class="meta">Proyectada al vuelo {carta.generado_at ? '· ' + carta.generado_at : ''}</p>

    {#each categorias as cat}
      <div class="categoria-bloque">
        <h3>{cat.nombre || cat.id}</h3>
        <table>
          <thead>
            <tr><th></th><th>Nombre</th><th>Precio</th><th>Descripción</th><th></th></tr>
          </thead>
          <tbody>
            {#each productosDe(cat) as prod}
              <tr class="fila-producto" on:click={() => toggleProducto(prod.id)}>
                <td class="thumb">{#if prod.imagen}<img src={prod.imagen} alt={prod.nombre} />{:else}—{/if}</td>
                <td>{prod.nombre}</td>
                <td>{prod.precio ?? '—'}</td>
                <td>{(prod.descripcion || '').slice(0, 60)}{(prod.descripcion || '').length > 60 ? '…' : ''}</td>
                <td>{expandedProducto === prod.id ? '▾' : '▸'}</td>
              </tr>
              {#if expandedProducto === prod.id}
                <tr class="detalle-producto">
                  <td colspan="5"><pre>{JSON.stringify(prod, null, 2)}</pre></td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/each}

    <div class="acciones">
      <button on:click={publicar}>Publicar a la PWA</button>
    </div>
  {/if}
</section>

<style>
  .zona-carta-publica {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .empty-state {
    color: #666;
    text-align: center;
    padding: 1.5rem;
  }
  .hint {
    color: #888;
    font-size: 0.85rem;
  }
  .meta {
    color: #999;
    font-size: 0.8rem;
    margin: 0 0 1rem;
  }
  .categoria-bloque {
    margin-bottom: 1rem;
  }
  .categoria-bloque h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th, td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #eee;
  }
  .thumb { width: 40px; }
  .thumb img { max-height: 32px; max-width: 40px; border-radius: 4px; }
  .fila-producto {
    cursor: pointer;
  }
  .fila-producto:hover {
    background: #eeeeee;
  }
  .detalle-producto pre {
    margin: 0;
    font-size: 0.78rem;
    white-space: pre-wrap;
  }
  .acciones {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  button {
    cursor: pointer;
  }
</style>
