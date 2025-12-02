<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let block: {
    id: string;
    tipo: string;
    categoria: string;
    nombre: string;
    icono?: string;
    forma?: string;
    props?: Record<string, any>;
    eventos?: Record<string, any[]>;
    descripcion?: string;
  } | null = null;

  const dispatch = createEventDispatcher();

  // Colores por categoria
  const categoryColors: Record<string, string> = {
    pantalla: '#9333EA',
    layout: '#3B82F6',
    contenedor: '#06B6D4',
    componente: '#22C55E',
    modulo: '#F59E0B',
    evento: '#EF4444',
    accion: '#EC4899',
    condicion: '#F97316',
    datos: '#8B5CF6'
  };

  // Opciones para selectores
  const tipoOpciones = ['mobile', 'tablet', 'desktop'];
  const posicionOpciones = ['left', 'right', 'top', 'bottom'];
  const varianteOpciones = ['primary', 'secondary', 'ghost', 'danger', 'success', 'warning'];
  const tamanoOpciones = ['sm', 'md', 'lg'];
  const metodoOpciones = ['efectivo', 'tarjeta', 'bizum', 'mixto', 'qr'];

  function updateProp(key: string, value: any) {
    if (!block) return;
    dispatch('update', { id: block.id, key, value });
  }

  function addEventHandler(eventType: string) {
    if (!block) return;
    dispatch('add-event', { id: block.id, eventType });
  }

  function removeEventHandler(eventType: string, index: number) {
    if (!block) return;
    dispatch('remove-event', { id: block.id, eventType, index });
  }

  function getInputType(key: string, value: any): string {
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'number') return 'number';
    if (key === 'emoji' || key === 'icono') return 'emoji';
    if (key === 'tipo' || key === 'posicion' || key === 'variante' || key === 'tamano' || key === 'metodo') return 'select';
    return 'text';
  }

  function getSelectOptions(key: string): string[] {
    switch (key) {
      case 'tipo': return tipoOpciones;
      case 'posicion': return posicionOpciones;
      case 'variante': return varianteOpciones;
      case 'tamano': return tamanoOpciones;
      case 'metodo': return metodoOpciones;
      default: return [];
    }
  }

  $: color = block ? categoryColors[block.categoria] || '#666' : '#666';
  $: eventSlots = ['on_click', 'on_double_click', 'on_long_press', 'on_change', 'on_submit'];
</script>

<div class="h-full flex flex-col bg-bg-primary border-l border-border overflow-hidden">
  {#if !block}
    <!-- No selection - mobile friendly -->
    <div class="flex-1 flex flex-col items-center justify-center text-text-muted p-6 md:p-4">
      <span class="text-5xl md:text-4xl mb-4 md:mb-3">👆</span>
      <p class="text-base md:text-sm text-center max-w-xs">
        <span class="hidden md:inline">Selecciona un bloque para ver sus propiedades</span>
        <span class="md:hidden">Toca un bloque en el <strong>Canvas</strong> para editar sus propiedades</span>
      </p>
    </div>
  {:else}
    <!-- Block info header - mobile optimized -->
    <div class="p-4 md:p-3 border-b border-border" style="background-color: {color}20">
      <div class="flex items-center gap-3 md:gap-2">
        <span
          class="w-5 h-5 md:w-4 md:h-4 rounded flex-shrink-0"
          style="background-color: {color}"
        ></span>
        <span class="text-2xl md:text-lg">{block.icono || '📦'}</span>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-base md:text-sm truncate">{block.nombre}</div>
          <div class="text-sm md:text-xs text-text-muted">{block.categoria} • {block.tipo}</div>
        </div>
      </div>
      {#if block.descripcion}
        <p class="text-sm md:text-xs text-text-muted mt-3 md:mt-2">{block.descripcion}</p>
      {/if}
    </div>

    <!-- Properties -->
    <div class="flex-1 overflow-y-auto overscroll-contain">
      <!-- Props section - mobile optimized -->
      {#if block.props && Object.keys(block.props).length > 0}
        <div class="p-4 md:p-3 border-b border-border">
          <h4 class="text-sm md:text-xs font-medium text-text-muted uppercase mb-4 md:mb-3">Propiedades</h4>
          <div class="space-y-4 md:space-y-3">
            {#each Object.entries(block.props) as [key, value]}
              {@const inputType = getInputType(key, value)}
              <div>
                <label class="block text-sm md:text-xs font-medium mb-2 md:mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>

                {#if inputType === 'checkbox'}
                  <label class="flex items-center gap-3 cursor-pointer py-2 md:py-0">
                    <input
                      type="checkbox"
                      checked={value}
                      on:change={(e) => updateProp(key, e.currentTarget.checked)}
                      class="w-5 h-5 md:w-4 md:h-4 rounded border-border"
                    />
                    <span class="text-base md:text-sm">{value ? 'Sí' : 'No'}</span>
                  </label>
                {:else if inputType === 'select'}
                  <select
                    value={value}
                    on:change={(e) => updateProp(key, e.currentTarget.value)}
                    class="w-full px-3 py-3 md:px-2 md:py-1.5 text-base md:text-sm bg-bg-input border border-border rounded-lg md:rounded"
                  >
                    {#each getSelectOptions(key) as opt}
                      <option value={opt}>{opt}</option>
                    {/each}
                  </select>
                {:else if inputType === 'number'}
                  <input
                    type="number"
                    value={value}
                    on:input={(e) => updateProp(key, Number(e.currentTarget.value))}
                    class="w-full px-3 py-3 md:px-2 md:py-1.5 text-base md:text-sm bg-bg-input border border-border rounded-lg md:rounded"
                  />
                {:else if inputType === 'emoji'}
                  <input
                    type="text"
                    value={value}
                    maxlength="4"
                    on:input={(e) => updateProp(key, e.currentTarget.value)}
                    class="w-20 md:w-16 px-3 py-3 md:px-2 md:py-1.5 text-xl md:text-sm text-center bg-bg-input border border-border rounded-lg md:rounded"
                  />
                {:else}
                  <input
                    type="text"
                    value={value || ''}
                    on:input={(e) => updateProp(key, e.currentTarget.value)}
                    class="w-full px-3 py-3 md:px-2 md:py-1.5 text-base md:text-sm bg-bg-input border border-border rounded-lg md:rounded"
                    placeholder="..."
                  />
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Event handlers section - mobile optimized -->
      {#if block.categoria === 'componente' || block.categoria === 'contenedor'}
        <div class="p-4 md:p-3 border-b border-border">
          <h4 class="text-sm md:text-xs font-medium text-text-muted uppercase mb-4 md:mb-3">Eventos</h4>
          <div class="space-y-3 md:space-y-2">
            {#each eventSlots.slice(0, 3) as slot}
              <div class="p-3 md:p-2 bg-bg-secondary rounded-lg md:rounded border border-border">
                <div class="flex items-center justify-between mb-2 md:mb-1">
                  <span class="text-sm md:text-xs font-medium capitalize">{slot.replace('on_', '').replace('_', ' ')}</span>
                  <button
                    class="px-3 py-1.5 md:px-2 md:py-0 text-sm md:text-xs text-primary bg-primary/10 md:bg-transparent rounded-lg md:rounded hover:bg-primary/20 md:hover:underline"
                    on:click={() => addEventHandler(slot)}
                  >
                    + Añadir
                  </button>
                </div>

                {#if block.eventos?.[slot]}
                  <div class="space-y-2 md:space-y-1 mt-2">
                    {#each block.eventos[slot] as action, i}
                      <div class="flex items-center gap-2 md:gap-1 px-3 py-2 md:px-2 md:py-1 bg-pink-500/20 rounded-lg md:rounded text-sm md:text-xs">
                        <span class="flex-1 truncate">{action.nombre || action.tipo}</span>
                        <button
                          class="w-8 h-8 md:w-auto md:h-auto flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-lg md:rounded"
                          on:click={() => removeEventHandler(slot, i)}
                        >
                          ×
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="text-sm md:text-xs text-text-muted">Sin acciones</p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Add new prop - mobile optimized -->
      <div class="p-4 md:p-3">
        <button
          class="w-full py-4 md:py-2 text-base md:text-sm text-center border-2 md:border border-dashed border-border rounded-xl md:rounded hover:border-primary hover:text-primary active:bg-primary/5 transition-colors"
          on:click={() => {
            const propName = prompt('Nombre de la propiedad:');
            if (propName) updateProp(propName, '');
          }}
        >
          + Añadir propiedad
        </button>
      </div>
    </div>

    <!-- Block ID footer - mobile friendly -->
    <div class="p-3 md:p-2 border-t border-border text-sm md:text-xs text-text-muted bg-bg-secondary/50">
      <span class="md:hidden">Bloque: </span>
      <span class="hidden md:inline">ID: </span>
      <code class="bg-bg-primary px-2 py-0.5 md:px-1 rounded text-xs break-all">{block.id}</code>
    </div>
  {/if}
</div>
