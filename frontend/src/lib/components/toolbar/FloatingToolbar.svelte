<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ToolbarIcon from './ToolbarIcon.svelte';

  /**
   * FloatingToolbar - Componente base para barras flotantes
   *
   * Siguiendo CONTEXT_UI.md:
   * - Tamaño colapsado: 10-12mm
   * - Expandible bajo demanda
   * - Posición configurable (top, right, bottom)
   */

  // Tipos
  export interface ToolbarIconConfig {
    id: string;
    icon: string;
    label: string;
    badge?: string | number;
    disabled?: boolean;
    actions?: {
      tap?: ActionConfig;
      doubleTap?: ActionConfig;
      longPress?: ActionConfig;
    };
  }

  export interface ActionConfig {
    type: 'panel' | 'modal' | 'navigate' | 'emit-event';
    target: string;
    size?: 'small' | 'medium' | 'full';
  }

  // Props
  export let position: 'top' | 'right' | 'bottom' = 'top';
  export let icons: ToolbarIconConfig[] = [];
  export let expanded = false;
  export let collapsible = true;
  export let size: number = 44; // ~11mm en pantallas estándar
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    tap: { iconId: string; action?: ActionConfig };
    doubleTap: { iconId: string; action?: ActionConfig };
    longPress: { iconId: string; action?: ActionConfig };
    expand: void;
    collapse: void;
  }>();

  // Estado interno
  let isExpanded = expanded;

  // Clases según posición
  const positionClasses = {
    top: 'top-0 left-0 right-0 flex-row',
    right: 'top-0 right-0 bottom-0 flex-col',
    bottom: 'bottom-0 left-0 right-0 flex-row'
  };

  const expandDirectionClasses = {
    top: 'origin-top',
    right: 'origin-right',
    bottom: 'origin-bottom'
  };

  // Manejadores de eventos de iconos
  function handleIconTap(event: CustomEvent<{ id: string }>) {
    const icon = icons.find(i => i.id === event.detail.id);
    dispatch('tap', {
      iconId: event.detail.id,
      action: icon?.actions?.tap
    });
  }

  function handleIconDoubleTap(event: CustomEvent<{ id: string }>) {
    const icon = icons.find(i => i.id === event.detail.id);
    dispatch('doubleTap', {
      iconId: event.detail.id,
      action: icon?.actions?.doubleTap
    });
  }

  function handleIconLongPress(event: CustomEvent<{ id: string }>) {
    const icon = icons.find(i => i.id === event.detail.id);
    dispatch('longPress', {
      iconId: event.detail.id,
      action: icon?.actions?.longPress
    });
  }

  function toggleExpand() {
    if (!collapsible) return;
    isExpanded = !isExpanded;
    dispatch(isExpanded ? 'expand' : 'collapse');
  }

  // Estilos dinámicos
  $: sizeStyle = position === 'right'
    ? `width: ${isExpanded ? 'auto' : size + 'px'}; min-width: ${size}px;`
    : `height: ${isExpanded ? 'auto' : size + 'px'}; min-height: ${size}px;`;

  $: containerClasses = [
    'floating-toolbar',
    'fixed z-100',
    'bg-bg-card/95 backdrop-blur-sm',
    'border border-border',
    'shadow-lg',
    'flex items-center',
    'transition-all duration-200 ease-out',
    positionClasses[position],
    expandDirectionClasses[position],
    isExpanded && 'expanded',
    className
  ].filter(Boolean).join(' ');
</script>

<div
  class={containerClasses}
  style={sizeStyle}
  role="toolbar"
  aria-orientation={position === 'right' ? 'vertical' : 'horizontal'}
  aria-expanded={isExpanded}
>
  <!-- Iconos -->
  <div class="flex {position === 'right' ? 'flex-col' : 'flex-row'} items-center gap-1 p-1">
    {#each icons as icon (icon.id)}
      <ToolbarIcon
        id={icon.id}
        icon={icon.icon}
        label={icon.label}
        badge={icon.badge}
        disabled={icon.disabled}
        showLabel={isExpanded}
        orientation={position === 'right' ? 'vertical' : 'horizontal'}
        on:tap={handleIconTap}
        on:doubleTap={handleIconDoubleTap}
        on:longPress={handleIconLongPress}
      />
    {/each}
  </div>

  <!-- Botón expandir/colapsar -->
  {#if collapsible}
    <button
      class="expand-toggle p-1 text-text-muted hover:text-text transition-colors"
      on:click={toggleExpand}
      aria-label={isExpanded ? 'Colapsar barra' : 'Expandir barra'}
    >
      {#if position === 'top'}
        <span class="text-xs">{isExpanded ? '▲' : '▼'}</span>
      {:else if position === 'right'}
        <span class="text-xs">{isExpanded ? '▶' : '◀'}</span>
      {:else}
        <span class="text-xs">{isExpanded ? '▼' : '▲'}</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .floating-toolbar {
    /* Asegurar que no tape contenido crítico */
    pointer-events: auto;
  }

  .floating-toolbar.expanded {
    /* Cuando está expandido, permitir más espacio */
    padding: 0.5rem;
  }

  /* Posiciones específicas */
  .floating-toolbar[aria-orientation="horizontal"] {
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .floating-toolbar[aria-orientation="vertical"] {
    border-radius: 0.5rem 0 0 0.5rem;
  }

  /* Ajustes para bottom */
  :global(.floating-toolbar.bottom) {
    border-radius: 0.5rem 0.5rem 0 0;
  }
</style>
