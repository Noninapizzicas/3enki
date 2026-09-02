<script lang="ts">
  import '$lib/ui-skin/pieles/the-pirate.css';

  /* ═══════════════════════════════════════════════
     CONTRATO DE DATOS — lo que proyecta el backend
     ═══════════════════════════════════════════════ */
  interface Categoria { id: string; nombre: string }
  interface Alergeno  { id: string; nombre: string; emoji: string }
  interface Producto  {
    id: string; nombre: string; descripcion: string;
    precio: number; imagen?: string;
    ingredientes: string[]; alergenos: string[];
    categoriaId: string;
  }

  /* ═══════════════════════════════════
     DATOS MOCK — reflejos directos
     ═══════════════════════════════════ */
  const marca = {
    nombre: 'THE PIRATE',
    lema: 'Abierto ante la ley · Saqueado con gusto',
    telefono: '643 283 034',
    whatsapp: '34643283034',
    direccion: 'Juan Carlos I, 49 · Lorca',
    direccionMaps: 'https://maps.google.com/?q=Juan+Carlos+I+49+Lorca',
    horario: 'Martes a domingo, 19:30 — 23:30',
    instagram: 'https://instagram.com/thepiratelorca'
  };

  const alegenosLeyenda: Record<string, Alergeno> = {
    gluten:  { id: 'gluten',  nombre: 'Gluten',  emoji: '🌾' },
    lacteos: { id: 'lacteos', nombre: 'Lácteos', emoji: '🥛' },
    frutos:  { id: 'frutos',  nombre: 'Frutos secos', emoji: '🥜' },
    huevo:   { id: 'huevo',   nombre: 'Huevo',   emoji: '🥚' },
    moluscos:{ id: 'moluscos',nombre: 'Moluscos', emoji: '🐙' },
    pescado: { id: 'pescado', nombre: 'Pescado',  emoji: '🐟' },
  };

  const categorias: Categoria[] = [
    { id: 'pizzas',    nombre: 'Pizzas' },
    { id: 'entrantes', nombre: 'Entrantes' },
    { id: 'postres',   nombre: 'Postres' },
    { id: 'bebidas',   nombre: 'Bebidas' },
  ];

  const productos: Producto[] = [
    {
      id: 'p1', categoriaId: 'pizzas', nombre: 'La Capitana',
      descripcion: 'Mozzarella di bufala, \'nduja calabresa, cebolla caramelizada al Pedro Ximénez, rúcula salvaje. La que manda en la carta.',
      precio: 14.50,
      ingredientes: ['Mozzarella di bufala', '\'Nduja', 'Cebolla caramelizada', 'PX', 'Rúcula'],
      alergenos: ['gluten', 'lacteos']
    },
    {
      id: 'p2', categoriaId: 'pizzas', nombre: 'Stracchino & Miel',
      descripcion: 'Base blanca, stracchino fundido, nueces tostadas, miel de romero, pimienta negra molida al momento.',
      precio: 13.00,
      ingredientes: ['Stracchino', 'Nueces', 'Miel de romero', 'Pimienta negra'],
      alergenos: ['gluten', 'lacteos', 'frutos']
    },
    {
      id: 'p3', categoriaId: 'pizzas', nombre: 'La Sobrasada',
      descripcion: 'Sobrasada mallorquina, queso de cabra, cebolla morada, miel de azahar. Mediterráneo sin fronteras.',
      precio: 13.50,
      ingredientes: ['Sobrasada', 'Queso de cabra', 'Cebolla morada', 'Miel de azahar'],
      alergenos: ['gluten', 'lacteos']
    },
    {
      id: 'p4', categoriaId: 'pizzas', nombre: 'Margherita',
      descripcion: 'Tomate San Marzano, mozzarella fior di latte, albahaca fresca, aceite de oliva virgen extra.',
      precio: 10.50,
      ingredientes: ['Tomate San Marzano', 'Mozzarella', 'Albahaca', 'AOVE'],
      alergenos: ['gluten', 'lacteos']
    },
    {
      id: 'p5', categoriaId: 'entrantes', nombre: 'Burrata del Puerto',
      descripcion: 'Burrata cremosa, tomate corazón de buey, pesto genovés, piñones tostados.',
      precio: 12.00,
      ingredientes: ['Burrata', 'Tomate corazón de buey', 'Pesto', 'Piñones'],
      alergenos: ['lacteos', 'frutos']
    },
    {
      id: 'p6', categoriaId: 'entrantes', nombre: 'Pulpo a la Brasa',
      descripcion: 'Pulpo gallego, patata violeta, pimentón de la Vera, aceite de ajo negro.',
      precio: 16.00,
      ingredientes: ['Pulpo', 'Patata violeta', 'Pimentón', 'Ajo negro'],
      alergenos: ['moluscos']
    },
    {
      id: 'p7', categoriaId: 'postres', nombre: 'Tiramisú Pirata',
      descripcion: 'Mascarpone, café de especialidad, cacao amargo, bizcocho empapado en ron.',
      precio: 6.50,
      ingredientes: ['Mascarpone', 'Café', 'Cacao', 'Ron', 'Bizcocho'],
      alergenos: ['gluten', 'lacteos', 'huevo']
    },
    {
      id: 'p8', categoriaId: 'bebidas', nombre: 'Limonada del Capitán',
      descripcion: 'Limón natural, jengibre fresco, menta, agua con gas.',
      precio: 4.50,
      ingredientes: ['Limón', 'Jengibre', 'Menta'],
      alergenos: []
    },
  ];

  /* ═══════════════════════════════════
     CONVERSORES — transforman datos
     ═══════════════════════════════════ */

  // [13,23] Conversor: ID alérgeno → {nombre, emoji}
  function alergInfo(id: string): Alergeno {
    return alegenosLeyenda[id] ?? { id, nombre: id, emoji: '⚠️' };
  }

  // [12] Conversor: precio numérico → string formateado
  function formatPrecio(n: number): string {
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  // [26] Conversor: teléfono → URL WhatsApp pre-rellenada
  function waUrl(tel: string): string {
    return `https://wa.me/${tel}?text=${encodeURIComponent('Hola, quiero hacer un pedido')}`;
  }

  // Productos por categoría
  function productosDe(catId: string): Producto[] {
    return productos.filter(p => p.categoriaId === catId);
  }

  /* ═══════════════════════════════════
     CUSTODIOS — guardan estado
     ═══════════════════════════════════ */

  // [7] Custodio: categoría activa (sincronizada con scroll)
  let activeCat = $state(categorias[0]?.id ?? '');

  // [24] Custodio: accordion (máx 1 producto expandido)
  let expandedId = $state<string | null>(null);

  // [27] Custodio: visibilidad del FAB
  let showFab = $state(false);

  // [21] Custodio: toggle expansión de producto
  function toggleProducto(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  /* ═══════════════════════════════════
     PUENTES — conectan dominios
     ═══════════════════════════════════ */

  // [8] Puente: chip tap → scroll a sección
  function scrollToSection(catId: string) {
    activeCat = catId;
    const el = document.getElementById(`cat-${catId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // [7] IntersectionObserver para sincronizar nav con scroll
  function observeSections(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeCat = entry.target.id.replace('cat-', '');
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    const sections = node.querySelectorAll('[data-cat-section]');
    sections.forEach(s => observer.observe(s));

    return {
      destroy() { observer.disconnect(); }
    };
  }

  // [27] Scroll listener para visibilidad del FAB
  function observeFab(_node: HTMLElement) {
    function onScroll() {
      showFab = window.scrollY > 300;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return {
      destroy() { window.removeEventListener('scroll', onScroll); }
    };
  }

  // [7] Mantener chip activo visible en la barra
  function scrollChipIntoView(catId: string) {
    const chip = document.querySelector(`[data-chip="${catId}"]`);
    if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  $effect(() => {
    scrollChipIntoView(activeCat);
  });
</script>

<!-- [4] Ambiente: data-piel activa la piel CSS -->
<div data-piel="the-pirate" class="carta" use:observeFab use:observeSections>

  <!-- ═══════════════════════════════════════
       A. CABECERA — átomos 1-4 (reflejos)
       Compacta. Sello, no hero.
       ═══════════════════════════════════════ -->
  <header class="cabecera">
    <!-- [1] Logo -->
    {#if marca.logo}
      <img class="carta-logo" src={marca.logo} alt={marca.nombre} />
    {/if}
    <!-- [2] Nombre -->
    <h1 class="carta-nombre">{marca.nombre}</h1>
    <!-- [3] Lema -->
    <p class="carta-lema">{marca.lema}</p>
  </header>

  <!-- ═══════════════════════════════════════
       B. NAVEGACIÓN — átomos 5-8
       Chips horizontales, sticky, scroll sync
       ═══════════════════════════════════════ -->
  <!-- [6] Barra contenedora: sticky + horizontal scroll -->
  <nav class="carta-nav">
    <div class="carta-nav-scroll">
      {#each categorias as cat}
        <!-- [5] Chip: reflejo del nombre de categoría -->
        <button
          class="carta-chip"
          class:activo={activeCat === cat.id}
          data-chip={cat.id}
          onclick={() => scrollToSection(cat.id)}
        >
          {cat.nombre}
        </button>
      {/each}
    </div>
  </nav>

  <!-- ═══════════════════════════════════════
       C + E. PRODUCTOS + DETALLE — átomos 9-14, 20-24
       Layout convergente + accordion
       ═══════════════════════════════════════ -->
  <main class="carta-body">
    {#each categorias as cat}
      <section id="cat-{cat.id}" data-cat-section class="carta-seccion">
        <h2 class="carta-seccion-titulo">{cat.nombre}</h2>

        {#each productosDe(cat.id) as prod}
          <div class="producto" class:abierto={expandedId === prod.id}>
            <!-- [20] Trigger: toda la fila es tocable (puente) -->
            <!-- [14] Layout convergente: fila [thumb | nombre+desc | precio] -->
            <button
              class="producto-fila"
              onclick={() => toggleProducto(prod.id)}
              aria-expanded={expandedId === prod.id}
            >
              <!-- [9] Imagen: lazy + aspect-ratio + fallback -->
              <span class="producto-thumb">
                {#if prod.imagen}
                  <img loading="lazy" src={prod.imagen} alt={prod.nombre} />
                {:else}
                  <span class="producto-thumb-ph">🍕</span>
                {/if}
              </span>

              <span class="producto-info">
                <!-- [10] Nombre producto -->
                <span class="producto-nombre">{prod.nombre}</span>
                <!-- [11] Descripción corta (truncada) -->
                <span class="producto-desc">{prod.descripcion}</span>
              </span>

              <!-- [13] Badges alérgenos (conversor: ID → emoji) -->
              {#if prod.alergenos.length > 0}
                <span class="producto-alerg" title="Alérgenos">
                  {prod.alergenos.map(id => alergInfo(id).emoji).join(' ')}
                </span>
              {/if}

              <!-- [12] Precio (conversor: número → formato) -->
              <span class="producto-precio">{formatPrecio(prod.precio)}</span>
            </button>

            <!-- [21] Panel animado: expand/collapse (custodio) -->
            {#if expandedId === prod.id}
              <div class="producto-detalle">
                <!-- Descripción completa -->
                {#if prod.descripcion}
                  <p class="detalle-desc">{prod.descripcion}</p>
                {/if}

                <!-- [22] Ingredientes como chips (reflejo) -->
                {#if prod.ingredientes.length > 0}
                  <div class="detalle-bloque">
                    <span class="detalle-label">Ingredientes</span>
                    <div class="detalle-chips">
                      {#each prod.ingredientes as ing}
                        <span class="chip">{ing}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- [23] Alérgenos con nombre (conversor: ID → nombre + emoji) -->
                {#if prod.alergenos.length > 0}
                  <div class="detalle-bloque">
                    <span class="detalle-label">Alérgenos</span>
                    <div class="detalle-chips">
                      {#each prod.alergenos as id}
                        <span class="chip chip-alerg">
                          {alergInfo(id).emoji} {alergInfo(id).nombre}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </section>
    {/each}
  </main>

  <!-- ═══════════════════════════════════════
       D. PIE — átomos 15-19 (reflejos)
       ═══════════════════════════════════════ -->
  <footer class="carta-pie">
    <!-- [15] Horario -->
    <p class="pie-horario">{marca.horario}</p>
    <!-- [16] Dirección + link Maps -->
    <p><a class="pie-link" href={marca.direccionMaps} target="_blank" rel="noopener">{marca.direccion}</a></p>
    <!-- [17] Teléfono + link tel: -->
    <p><a class="pie-link" href="tel:{marca.telefono.replace(/\s/g, '')}">{marca.telefono}</a></p>
    <!-- [18] Redes -->
    {#if marca.instagram}
      <p>
        <a class="pie-link pie-social" href={marca.instagram} target="_blank" rel="noopener">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          Instagram
        </a>
      </p>
    {/if}
    <!-- [19] Legal -->
    <p class="pie-legal">Precios con IVA incluido · Consulta alérgenos con el personal</p>
  </footer>

  <!-- ═══════════════════════════════════════
       F. FAB PEDIDO — átomos 25-27
       Botón flotante WhatsApp
       ═══════════════════════════════════════ -->
  <!-- [27] Visibilidad condicional (custodio: scroll threshold) -->
  {#if showFab}
    <!-- [25] FAB: posición fija bottom-right -->
    <!-- [26] Link WhatsApp (conversor: tel → URL wa.me) -->
    <a class="carta-fab" href={waUrl(marca.whatsapp)} target="_blank" rel="noopener">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Pedir
    </a>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════
     LAYOUT DE LA CARTA — consume tokens de la piel
     Mobile-first. 320px+.
     ═══════════════════════════════════════ */

  .carta {
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--surface-base);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: var(--fs-base);
    line-height: var(--lh-normal);
    -webkit-font-smoothing: antialiased;
  }

  /* ── A. CABECERA ── */
  .cabecera {
    text-align: center;
    padding: var(--space-card) var(--space-page);
    padding-top: calc(var(--space-section) * 0.6);
    padding-bottom: var(--space-element);
    background: var(--surface-sunken);
  }

  .carta-logo {
    width: 64px;
    height: 64px;
    object-fit: contain;
    margin-bottom: var(--space-micro);
  }

  .carta-nombre {
    font-family: var(--font-display);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-display);
    letter-spacing: var(--ls-caps);
    color: var(--text-accent);
    margin: 0;
    line-height: var(--lh-tight);
  }

  .carta-lema {
    font-family: var(--font-body);
    font-size: var(--fs-sm);
    letter-spacing: var(--ls-wide);
    color: var(--text-muted);
    margin: var(--space-micro) 0 0;
    text-transform: uppercase;
  }

  /* ── B. NAVEGACIÓN ── */
  .carta-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface-elevated);
    border-bottom: 1px solid var(--border-subtle);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .carta-nav-scroll {
    display: flex;
    gap: var(--space-micro);
    overflow-x: auto;
    padding: var(--space-micro) var(--space-page);
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .carta-nav-scroll::-webkit-scrollbar { display: none; }

  .carta-chip {
    flex-shrink: 0;
    padding: 8px 16px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--fs-sm);
    font-weight: var(--fw-body);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--duration-fast) var(--ease-default);
    min-height: 44px;
    min-width: 44px;
  }

  .carta-chip.activo {
    background: var(--action-primary);
    color: var(--action-primary-text);
    border-color: var(--action-primary);
    font-weight: var(--fw-strong);
  }

  .carta-chip:not(.activo):active {
    background: var(--surface-raised);
  }

  /* ── C. CUERPO ── */
  .carta-body {
    padding: 0 var(--space-page);
  }

  .carta-seccion {
    padding-top: var(--space-section);
    scroll-margin-top: 60px;
  }

  .carta-seccion-titulo {
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: var(--fw-display);
    color: var(--text-accent);
    letter-spacing: var(--ls-wide);
    margin: 0 0 var(--space-element);
    padding-bottom: var(--space-micro);
    border-bottom: 1px solid var(--border-subtle);
  }

  /* ── C. PRODUCTO (layout convergente) ── */
  .producto {
    border-radius: var(--radius);
    overflow: hidden;
    transition: background var(--duration-fast) var(--ease-default);
  }

  .producto + .producto {
    margin-top: 2px;
  }

  .producto.abierto {
    background: var(--surface-raised);
  }

  .producto-fila {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-primary);
    text-align: left;
    font-size: var(--fs-base);
    min-height: 44px;
    transition: background var(--duration-fast) var(--ease-default);
  }

  .producto-fila:active {
    background: var(--surface-raised);
  }

  /* Imagen/thumb */
  .producto-thumb {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-sunken);
  }

  .producto-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .producto-thumb-ph {
    font-size: 1.2rem;
    opacity: 0.4;
  }

  /* Info (nombre + desc) */
  .producto-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .producto-nombre {
    font-family: var(--font-display);
    font-weight: var(--fw-strong);
    font-size: var(--fs-base);
    line-height: var(--lh-snug);
    color: var(--text-primary);
  }

  .producto-desc {
    font-size: var(--fs-xs);
    line-height: var(--lh-normal);
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Alérgenos badges */
  .producto-alerg {
    font-size: var(--fs-sm);
    letter-spacing: 2px;
    flex-shrink: 0;
    opacity: 0.85;
  }

  /* Precio */
  .producto-precio {
    font-family: var(--font-display);
    font-weight: var(--fw-display);
    font-size: var(--fs-base);
    color: var(--text-accent);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── E. DETALLE BAJO DEMANDA ── */
  .producto-detalle {
    padding: 0 12px 12px 68px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown var(--duration-fast) var(--ease-out);
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .detalle-desc {
    margin: 0;
    font-size: var(--fs-sm);
    line-height: var(--lh-normal);
    color: var(--text-secondary);
  }

  .detalle-bloque {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detalle-label {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--ls-caps);
    color: var(--text-muted);
  }

  .detalle-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    font-size: var(--fs-xs);
    padding: 4px 10px;
    background: var(--surface-sunken);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
  }

  .chip-alerg {
    background: oklch(0.18 0.04 80);
    border: 1px solid var(--border-accent);
    color: var(--text-accent);
  }

  /* ── D. PIE ── */
  .carta-pie {
    text-align: center;
    padding: var(--space-section) var(--space-page);
    margin-top: var(--space-section);
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-sunken);
  }

  .carta-pie p {
    margin: var(--space-micro) 0;
  }

  .pie-horario {
    font-family: var(--font-display);
    font-size: var(--fs-sm);
    font-weight: var(--fw-strong);
    color: var(--text-primary);
    letter-spacing: var(--ls-wide);
  }

  .pie-link {
    color: var(--text-accent);
    text-decoration: none;
    font-size: var(--fs-sm);
    transition: opacity var(--duration-fast) var(--ease-default);
  }
  .pie-link:active { opacity: 0.7; }

  .pie-social {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pie-social svg {
    vertical-align: middle;
  }

  .pie-legal {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    margin-top: var(--space-element) !important;
  }

  /* ── F. FAB ── */
  .carta-fab {
    position: fixed;
    bottom: 24px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: #25d366;
    color: #fff;
    font-family: var(--font-body);
    font-size: var(--fs-sm);
    font-weight: var(--fw-strong);
    border-radius: var(--radius-pill);
    text-decoration: none;
    box-shadow: 0 4px 12px oklch(0 0 0 / 0.4);
    z-index: 200;
    animation: fabIn var(--duration-base) var(--ease-out);
    min-height: 44px;
  }

  .carta-fab:active {
    transform: scale(0.96);
  }

  @keyframes fabIn {
    from { opacity: 0; transform: translateY(16px) scale(0.9); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ── Responsive ── */
  @media (min-width: 640px) {
    .producto-desc {
      -webkit-line-clamp: 2;
    }

    .producto-detalle {
      padding-left: 68px;
    }
  }

  @media (min-width: 768px) {
    .cabecera {
      padding-top: var(--space-section);
    }

    .carta-nombre {
      font-size: var(--fs-3xl);
    }

    .carta-body {
      max-width: 640px;
      margin: 0 auto;
    }
  }
</style>
