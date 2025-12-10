<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FloatingToolbar from './uisis-FloatingToolbar.svelte';
  import type { ToolbarIconConfig, ActionConfig } from './uisis-FloatingToolbar.svelte';

  /**
   * ModuleToolbar - Barra superior configurable por módulo
   *
   * Siguiendo CONTEXT_UI.md:
   * - Posición: Parte superior
   * - Dominio: Trabajo actual, módulo activo
   * - Configuración: VARIABLE por módulo
   */

  // Props
  export let moduleName: string = '';
  export let icons: ToolbarIconConfig[] = [];
  export let expanded = false;
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    action: {
      type: 'tap' | 'doubleTap' | 'longPress';
      iconId: string;
      action?: ActionConfig;
      moduleName: string;
    };
  }>();

  // Handlers
  function handleTap(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'tap',
      iconId: event.detail.iconId,
      action: event.detail.action,
      moduleName
    });
  }

  function handleDoubleTap(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'doubleTap',
      iconId: event.detail.iconId,
      action: event.detail.action,
      moduleName
    });
  }

  function handleLongPress(event: CustomEvent<{ iconId: string; action?: ActionConfig }>) {
    dispatch('action', {
      type: 'longPress',
      iconId: event.detail.iconId,
      action: event.detail.action,
      moduleName
    });
  }
</script>

<FloatingToolbar
  position="top"
  {icons}
  {expanded}
  collapsible={true}
  class="module-toolbar {className}"
  on:tap={handleTap}
  on:doubleTap={handleDoubleTap}
  on:longPress={handleLongPress}
  on:expand
  on:collapse
/>

<style>
  :global(.module-toolbar) {
    /* Espacio para status bar en móviles */
    padding-top: env(safe-area-inset-top, 0);
  }
</style>
