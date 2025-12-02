<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import ScratchBlock from './ScratchBlock.svelte';
  import config from '$lib/config';

  const dispatch = createEventDispatcher();

  interface Block {
    id: string;
    tipo?: string;
    categoria: string;
    nombre: string;
    icono?: string;
    forma?: string;
    props?: Record<string, any>;
    descripcion?: string;
  }

  interface BlockCategory {
    id: string;
    nombre: string;
    icono: string;
    color: string;
    bloques: Block[];
  }

  let categories: BlockCategory[] = [];
  let loading = true;
  let expandedCategory: string | null = 'modulo';
  let searchQuery = '';

  const apiBase = `${config.apiUrl}/modules/scratch-designer`;

  // Categorias con iconos y colores
  const categoryMeta: Record<string, { icono: string; color: string; orden: number }> = {
    pantalla:   { icono: '📱', color: '#9333EA', orden: 0 },
    layout:     { icono: '📐', color: '#3B82F6', orden: 1 },
    contenedor: { icono: '📦', color: '#06B6D4', orden: 2 },
    componente: { icono: '🧩', color: '#22C55E', orden: 3 },
    modulo:     { icono: '⚡', color: '#F59E0B', orden: 4 },
    evento:     { icono: '📡', color: '#EF4444', orden: 5 },
    accion:     { icono: '▶️', color: '#EC4899', orden: 6 },
    condicion:  { icono: '❓', color: '#F97316', orden: 7 },
    datos:      { icono: '💾', color: '#8B5CF6', orden: 8 }
  };

  async function fetchBlocks() {
    loading = true;
    try {
      const res = await fetch(`${apiBase}/blocks/all`);
      if (!res.ok) throw new Error('Error al cargar bloques');
      const data = await res.json();

      // Organizar bloques por categoria
      const blocks = data.blocks;
      const categoryMap = new Map<string, Block[]>();

      // Procesar cada tipo de bloque
      processBlocks(blocks.pantalla, 'pantalla', categoryMap);
      processBlocks(blocks.layout, 'layout', categoryMap);
      processBlocks(blocks.contenedor, 'contenedor', categoryMap);
      processBlocks(blocks.componente, 'componente', categoryMap);
      processBlocks(blocks.modulo, 'modulo', categoryMap);
      processEventBlocks(blocks.evento, categoryMap);
      processActionBlocks(blocks.accion, categoryMap);
      processBlocks(blocks.condicion, 'condicion', categoryMap);
      processBlocks(blocks.datos, 'datos', categoryMap);

      // Convertir a array ordenado
      categories = Array.from(categoryMap.entries())
        .map(([id, bloques]) => ({
          id,
          nombre: id.charAt(0).toUpperCase() + id.slice(1),
          icono: categoryMeta[id]?.icono || '📦',
          color: categoryMeta[id]?.color || '#666',
          bloques
        }))
        .sort((a, b) => (categoryMeta[a.id]?.orden ?? 99) - (categoryMeta[b.id]?.orden ?? 99));

    } catch (err) {
      console.error('Error loading blocks:', err);
    } finally {
      loading = false;
    }
  }

  function processBlocks(blocks: any[], categoria: string, map: Map<string, Block[]>) {
    if (!Array.isArray(blocks)) return;

    const list = map.get(categoria) || [];
    for (const b of blocks) {
      list.push({
        id: b.id,
        tipo: b.id,
        categoria,
        nombre: b.nombre || b.label || b.id,
        icono: b.icono || b.icon,
        forma: b.forma,
        props: b.props || b.defaultProps || {},
        descripcion: b.descripcion || b.description
      });
    }
    map.set(categoria, list);
  }

  function processEventBlocks(eventos: any, map: Map<string, Block[]>) {
    if (!eventos) return;

    const list = map.get('evento') || [];

    // Eventos de escucha
    if (eventos.escucha) {
      for (const e of eventos.escucha) {
        list.push({
          id: e.id,
          tipo: e.id,
          categoria: 'evento',
          nombre: e.nombre || `Cuando ${e.evento}`,
          icono: '📡',
          forma: 'hat',
          props: { evento: e.evento }
        });
      }
    }

    // Eventos de emision
    if (eventos.emite) {
      for (const e of eventos.emite) {
        list.push({
          id: e.id,
          tipo: e.id,
          categoria: 'evento',
          nombre: e.nombre || 'Emitir evento',
          icono: '📤',
          forma: 'statement',
          props: e.props || {}
        });
      }
    }

    map.set('evento', list);
  }

  function processActionBlocks(acciones: any, map: Map<string, Block[]>) {
    if (!acciones) return;

    const list = map.get('accion') || [];

    // Navegacion
    if (acciones.navegacion) {
      for (const a of acciones.navegacion) {
        list.push({
          id: a.id,
          tipo: a.id,
          categoria: 'accion',
          nombre: a.nombre,
          icono: '🔗',
          forma: 'statement',
          props: a.props || {}
        });
      }
    }

    // APIs
    if (acciones.api) {
      for (const a of acciones.api) {
        list.push({
          id: a.id,
          tipo: a.id,
          categoria: 'accion',
          nombre: a.nombre,
          icono: a.metodo === 'GET' ? '📥' : a.metodo === 'POST' ? '📤' : '🔄',
          forma: 'statement',
          props: a.props || {},
          descripcion: `${a.metodo} ${a.endpoint || ''}`
        });
      }
    }

    // Acciones de modulo
    if (acciones.modulo) {
      for (const a of acciones.modulo) {
        list.push({
          id: a.id,
          tipo: a.id,
          categoria: 'accion',
          nombre: a.nombre,
          icono: '⚡',
          forma: 'statement',
          props: a.props || {}
        });
      }
    }

    // Acciones UI
    if (acciones.ui) {
      for (const a of acciones.ui) {
        list.push({
          id: a.id,
          tipo: a.id,
          categoria: 'accion',
          nombre: a.nombre,
          icono: '🎨',
          forma: 'statement',
          props: a.props || {}
        });
      }
    }

    // Acciones datos
    if (acciones.datos) {
      for (const a of acciones.datos) {
        list.push({
          id: a.id,
          tipo: a.id,
          categoria: 'accion',
          nombre: a.nombre,
          icono: '💾',
          forma: a.forma || 'statement',
          props: a.props || {}
        });
      }
    }

    map.set('accion', list);
  }

  function toggleCategory(id: string) {
    expandedCategory = expandedCategory === id ? null : id;
  }

  function handleBlockDragStart(e: CustomEvent<Block>) {
    dispatch('dragstart', e.detail);
  }

  function handleBlockClick(e: CustomEvent<Block>) {
    dispatch('select', e.detail);
  }

  // Filtrar bloques por busqueda
  $: filteredCategories = searchQuery
    ? categories.map(cat => ({
        ...cat,
        bloques: cat.bloques.filter(b =>
          b.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.descripcion?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.bloques.length > 0)
    : categories;

  onMount(fetchBlocks);
</script>

<div class="h-full flex flex-col bg-bg-primary border-r border-border">
  <!-- Header -->
  <div class="p-3 border-b border-border">
    <h3 class="font-medium text-sm mb-2">Bloques</h3>
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Buscar bloques..."
      class="w-full px-3 py-1.5 text-sm bg-bg-input border border-border rounded-lg"
    />
  </div>

  <!-- Categories -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="p-4 text-center text-text-muted">
        <span class="animate-spin inline-block">⏳</span>
        Cargando bloques...
      </div>
    {:else}
      {#each filteredCategories as category (category.id)}
        <div class="border-b border-border">
          <!-- Category header -->
          <button
            class="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-hover transition-colors text-left"
            on:click={() => toggleCategory(category.id)}
          >
            <span
              class="w-3 h-3 rounded-sm"
              style="background-color: {category.color}"
            ></span>
            <span>{category.icono}</span>
            <span class="flex-1 font-medium text-sm">{category.nombre}</span>
            <span class="text-xs text-text-muted">{category.bloques.length}</span>
            <span class="text-xs transition-transform {expandedCategory === category.id ? 'rotate-90' : ''}">
              ▶
            </span>
          </button>

          <!-- Blocks -->
          {#if expandedCategory === category.id || searchQuery}
            <div class="px-2 pb-2 space-y-1">
              {#each category.bloques as block (block.id)}
                <ScratchBlock
                  {block}
                  inPalette={true}
                  compact={true}
                  on:dragstart={handleBlockDragStart}
                  on:click={handleBlockClick}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer stats -->
  <div class="p-2 border-t border-border text-xs text-text-muted text-center">
    {categories.reduce((sum, c) => sum + c.bloques.length, 0)} bloques disponibles
  </div>
</div>
