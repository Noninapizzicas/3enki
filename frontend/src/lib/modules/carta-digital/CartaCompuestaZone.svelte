<script lang="ts">
  /**
   * CartaCompuestaZone - zona principal. Render tabular por categorias con expansion
   * por producto (Q3.A) + badge desfasada (Q4.A, comparador de timestamps) + acciones
   * via prefillChatInput (Q5, Postura B). NO compone local (D9) ni recompose auto (A1).
   */
  import {
    cartaDigitalConfig,
    estaCartaCompuestaDesfasada,
    ultimaActualizacionCartaUpstream
  } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';

  let expandedProducto: string | null = null;

  $: cartaCompuesta = $cartaDigitalConfig?.carta_compuesta;
  $: hayCarta = !!(cartaCompuesta && cartaCompuesta.meta);
  $: categorias = cartaCompuesta?.categorias || [];
  $: productos = cartaCompuesta?.productos || [];
  $: ofertas = cartaCompuesta?.ofertas || [];

  function productosDe(cat: any) {
    return productos.filter((p: any) => p.categoria_id === cat.id || p.categoria === cat.nombre);
  }
  function toggleProducto(id: string) {
    expandedProducto = expandedProducto === id ? null : id;
  }

  function recomponer() {
    prefillChatInput('Recompone la carta digital con la carta actual del proyecto. Si hay ofertas activas, incluyelas.');
  }
  function generarPWA() {
    prefillChatInput('Genera el bundle de la PWA con la carta compuesta actual. Despliegalo a /shop/<slug>.');
  }
  function verPublica() {
    prefillChatInput('Devuelveme la carta publica actual (lo que ve el cliente final).');
  }
</script>

<section class="zona-carta-compuesta">
  <h2>Carta compuesta (lo que ve el cliente)</h2>

  {#if !hayCarta}
    <div class="empty-state">
      <p>Aún no hay carta compuesta para servir.</p>
      <p class="hint">Pide al chat que componga la carta digital con la carta activa del proyecto.</p>
      <button on:click={recomponer}>Componer carta</button>
    </div>
  {:else}
    <div class="meta-carta-compuesta">
      <div><strong>Generada:</strong> {cartaCompuesta?.generado_at}</div>
      {#if cartaCompuesta?.generado_por}<div><strong>Por:</strong> {cartaCompuesta.generado_por}</div>{/if}
      {#if $estaCartaCompuestaDesfasada}
        <div class="badge-desfasada">
          ⚠ DESFASADA — la carta upstream se actualizó el {$ultimaActualizacionCartaUpstream}
          <button on:click={recomponer}>Recomponer</button>
        </div>
      {/if}
    </div>

    {#each categorias as cat}
      <div class="categoria-bloque">
        <h3>{cat.nombre || cat.id}</h3>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Precio</th><th>Descripción</th><th></th></tr>
          </thead>
          <tbody>
            {#each productosDe(cat) as prod}
              <tr class="fila-producto" on:click={() => toggleProducto(prod.id)}>
                <td>{prod.nombre}</td>
                <td>{prod.precio ?? '—'}</td>
                <td>{(prod.descripcion || '').slice(0, 60)}{(prod.descripcion || '').length > 60 ? '…' : ''}</td>
                <td>{expandedProducto === prod.id ? '▾' : '▸'}</td>
              </tr>
              {#if expandedProducto === prod.id}
                <tr class="detalle-producto">
                  <td colspan="4"><pre>{JSON.stringify(prod, null, 2)}</pre></td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/each}

    {#if ofertas.length > 0}
      <div class="ofertas-bloque">
        <h3>Ofertas activas ({ofertas.length})</h3>
        {#each ofertas as oferta}
          <details>
            <summary>{oferta.nombre || 'Oferta sin nombre'}</summary>
            <pre>{JSON.stringify(oferta, null, 2)}</pre>
          </details>
        {/each}
      </div>
    {/if}

    <div class="acciones-carta-compuesta">
      <button on:click={recomponer}>Recomponer carta</button>
      <button on:click={generarPWA}>Regenerar PWA</button>
      <button on:click={verPublica}>Ver carta pública</button>
    </div>
  {/if}
</section>

<style>
  .zona-carta-compuesta {
    border: 1px solid #e0e0e0;
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
  .meta-carta-compuesta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .badge-desfasada {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
    border-bottom: 1px solid #f0f0f0;
  }
  .fila-producto {
    cursor: pointer;
  }
  .fila-producto:hover {
    background: #fafafa;
  }
  .detalle-producto pre {
    margin: 0;
    font-size: 0.78rem;
    white-space: pre-wrap;
  }
  .acciones-carta-compuesta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  button {
    cursor: pointer;
  }
  details {
    margin-bottom: 0.5rem;
  }
  pre {
    white-space: pre-wrap;
  }
</style>
