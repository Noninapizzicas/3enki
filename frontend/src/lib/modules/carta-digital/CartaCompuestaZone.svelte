<script lang="ts">
  /**
   * CartaPublicaZone — la carta pública PROYECTADA (lo que ve el cliente), viva.
   * Ya no hay snapshot ni "desfasada": se proyecta al vuelo (carta+marca+contenido).
   * "Publicar" dispara el deploy a la PWA (cf-worker) vía chat.
   */
  import { cartaPublica } from '$lib/stores/carta-digital';
  import { prefillChatInput } from '$lib/stores/chatInputDraft';
  import { storageImg } from '$lib/ui-core/storage-image';
  import { activeProjectId } from '$lib/stores/projects';

  let expandedProducto: string | null = null;

  $: carta = $cartaPublica;
  $: categorias = carta?.categorias ?? [];
  $: productos = carta?.productos ?? [];
  // Mapa id→{nombre,emoji} de la leyenda de alérgenos de la proyección.
  $: alergMap = Object.fromEntries((carta?.alergenos_leyenda ?? []).map((a: any) => [a.id, a]));

  function productosDe(cat: any) {
    return productos.filter((p: any) => p.categoria_id === cat.id || p.categoria === cat.nombre || p.categoria === cat.id);
  }
  function toggleProducto(id: string) {
    expandedProducto = expandedProducto === id ? null : id;
  }
  function ingNombre(i: any): string {
    return typeof i === 'string' ? i : (i?.nombre ?? '');
  }
  function alergInfo(id: string): { nombre: string; emoji: string } {
    return alergMap[id] || { nombre: id, emoji: '⚠️' };
  }
  function precio(p: any): string {
    return p.precio != null ? Number(p.precio).toFixed(2).replace('.', ',') + ' €' : '—';
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
    <p class="meta">Proyectada al vuelo{carta.generado_at ? ' · ' + new Date(carta.generado_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</p>

    {#each categorias as cat}
      <div class="categoria-bloque">
        <h3>{cat.nombre || cat.id}</h3>
        <div class="productos">
          {#each productosDe(cat) as prod}
            <div class="producto" class:abierto={expandedProducto === prod.id}>
              <button class="fila" on:click={() => toggleProducto(prod.id)} aria-expanded={expandedProducto === prod.id}>
                <span class="p-thumb">
                  {#if prod.imagen}<img use:storageImg={{ path: prod.imagen, project: $activeProjectId }} alt={prod.nombre} />{:else}<span class="p-ph">🍽️</span>{/if}
                </span>
                <span class="p-nombre">{prod.nombre}</span>
                {#if (prod.alergenos ?? []).length}
                  <span class="p-alerg" title="Alérgenos">{prod.alergenos.map((id: string) => alergInfo(id).emoji).join(' ')}</span>
                {/if}
                <span class="p-precio">{precio(prod)}</span>
                <span class="caret">{expandedProducto === prod.id ? '▾' : '▸'}</span>
              </button>

              {#if expandedProducto === prod.id}
                <div class="detalle">
                  {#if prod.descripcion}<p class="d-desc">{prod.descripcion}</p>{/if}
                  {#if (prod.ingredientes ?? []).length}
                    <div class="d-bloque">
                      <span class="d-label">Ingredientes</span>
                      <div class="chips">
                        {#each prod.ingredientes as i}<span class="chip">{ingNombre(i)}</span>{/each}
                      </div>
                    </div>
                  {/if}
                  {#if (prod.alergenos ?? []).length}
                    <div class="d-bloque">
                      <span class="d-label">Alérgenos</span>
                      <div class="chips">
                        {#each prod.alergenos as id}
                          <span class="chip alerg">{alergInfo(id).emoji} {alergInfo(id).nombre}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <div class="acciones">
      <button class="btn-publicar" on:click={publicar}>Publicar a la PWA</button>
    </div>
  {/if}
</section>

<style>
  .zona-carta-publica {
    border: 1px solid var(--color-border, #333);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    background: var(--color-surface, #1a1a1a);
    color: var(--color-text, #e5e5e5);
  }
  h2 { font-size: 1rem; margin: 0 0 0.25rem; }
  .empty-state { color: var(--color-text-muted, #888); text-align: center; padding: 1.5rem; }
  .hint { color: var(--color-text-muted, #888); font-size: 0.85rem; }
  .meta { color: var(--color-text-muted, #666); font-size: 0.78rem; margin: 0 0 1rem; }
  .categoria-bloque { margin-bottom: 1rem; }
  .categoria-bloque h3 {
    margin: 0 0 0.5rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #888);
  }
  .productos { display: flex; flex-direction: column; gap: 4px; }
  .producto { background: var(--color-surface-2, #222); border-radius: 8px; overflow: hidden; }
  .producto.abierto { outline: 1px solid var(--color-border, #333); }
  .fila {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text, #e5e5e5);
    text-align: left;
    font-size: 0.85rem;
  }
  .fila:hover { background: var(--color-surface-3, #2c2c2c); }
  .p-thumb { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .p-thumb img { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; }
  .p-ph { font-size: 1.1rem; opacity: 0.5; }
  .p-nombre { font-weight: 600; flex: 1; min-width: 0; }
  .p-alerg { font-size: 0.85rem; letter-spacing: 1px; opacity: 0.9; }
  .p-precio { font-weight: 700; color: var(--color-primary, #f59e0b); white-space: nowrap; }
  .caret { color: var(--color-text-muted, #888); }
  .detalle { padding: 0 10px 10px 56px; display: flex; flex-direction: column; gap: 8px; }
  .d-desc { margin: 0; font-size: 0.8rem; color: var(--color-text-muted, #aaa); }
  .d-bloque { display: flex; flex-direction: column; gap: 4px; }
  .d-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted, #888); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip {
    font-size: 0.72rem;
    padding: 3px 8px;
    background: var(--color-surface-3, #2c2c2c);
    border-radius: 20px;
    color: var(--color-text, #ddd);
  }
  .chip.alerg {
    background: #241c08;
    border: 1px solid #6b4a00;
    color: #f5d99a;
  }
  .acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
  .btn-publicar {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--color-primary, #f59e0b);
    color: #000;
    font-weight: 700;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .btn-publicar:hover { filter: brightness(1.1); }
</style>
