<!--
  TextEditorButton.svelte
  =======================
  Botón unificado para editor de texto con DOBLE interacción.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre el editor con el archivo actual (si hay)
  - Long press / Click derecho: Abre TextEditorConfigPanel (configuración)

  text-editor usa enableAdd=false (archivos se crean desde file-browser).

  Skinnable via CSS Variables:
  --editor-btn-bg, --editor-btn-color

  Uso:
    <TextEditorButton
      size="md"
      {file}
      {projectId}
      on:openEditor={handleOpenEditor}
      on:config={handleConfig}
      on:save={handleSave}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import TextEditorPanel from './TextEditorPanel.svelte';
  import TextEditorConfigPanel from './TextEditorConfigPanel.svelte';
  import type { FileInfo } from './TextEditorPanel.svelte';
  import type { EditorSettings } from './TextEditorConfigPanel.svelte';

  // ============================================================================
  // TYPES
  // ============================================================================

  type Size = 'sm' | 'md' | 'lg';

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Tamaño del botón */
  export let size: Size = 'md';

  /** Archivo actualmente abierto */
  export let file: FileInfo | null = null;

  /** Project ID */
  export let projectId: string | null = null;

  /** Mostrar label */
  export let showLabel = true;

  /** Deshabilitar */
  export let disabled = false;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const SIZES: Record<Size, { btn: number; icon: string; label: string }> = {
    sm: { btn: 44, icon: '1.125rem', label: '0.625rem' },
    md: { btn: 56, icon: '1.5rem', label: '0.6875rem' },
    lg: { btn: 72, icon: '2rem', label: '0.75rem' }
  };

  const TIMING = {
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let editorOpen = false;
  let configOpen = false;
  let editorContent = '';

  let settings: EditorSettings = {
    tabSize: 2,
    autoSave: true,
    autoSaveInterval: 30000,
    wordWrap: true,
    showLineNumbers: true
  };

  let currentIcon = '📝';
  let currentLabel = 'Editor';

  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: s = SIZES[size];
  $: hasFile = file !== null;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    openEditor: { file: FileInfo | null };
    config: void;
    save: { file: FileInfo; content: string };
  }>();

  // ============================================================================
  // TIMER MANAGEMENT
  // ============================================================================

  function clearTimers(): void {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function resetGestureState(): void {
    clearTimers();
    isLongPress = false;
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /** Tap/Click → Abrir editor */
  function doOpenEditor(): void {
    editorOpen = true;
    dispatch('openEditor', { file });
  }

  /** Long press/Click derecho → Config */
  function doConfig(): void {
    configOpen = true;
    dispatch('config');
  }

  // ============================================================================
  // TOUCH HANDLERS
  // ============================================================================

  function handleTouchStart(e: TouchEvent): void {
    if (disabled) return;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleTouchEnd(e: TouchEvent): void {
    if (disabled) return;

    clearTimeout(longPressTimeout!);

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    doOpenEditor();
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  // ============================================================================
  // MOUSE HANDLERS
  // ============================================================================

  function handleMouseDown(e: MouseEvent): void {
    if (disabled || e.button !== 0) return;

    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      doConfig();
    }, TIMING.longPressDuration);
  }

  function handleMouseUp(e: MouseEvent): void {
    if (disabled || e.button !== 0) return;

    clearTimeout(longPressTimeout!);

    if (isLongPress) {
      isLongPress = false;
      return;
    }

    doOpenEditor();
  }

  function handleMouseLeave(): void {
    clearTimers();
  }

  function handleContextMenu(e: MouseEvent): void {
    if (disabled) return;
    e.preventDefault();
    doConfig();
  }

  // ============================================================================
  // PANEL HANDLERS
  // ============================================================================

  function handleEditorSave(e: CustomEvent<{ file: FileInfo; content: string }>): void {
    dispatch('save', e.detail);
  }

  function handleEditorContentChange(e: CustomEvent<{ content: string }>): void {
    editorContent = e.detail.content;
  }

  function handleConfigFormat(e: CustomEvent<{ content: string }>): void {
    editorContent = e.detail.content;
    // Will need to communicate with editor panel
  }

  function handleConfigSettingsChange(e: CustomEvent<{ settings: EditorSettings }>): void {
    settings = e.detail.settings;
  }

  // ============================================================================
  // PUBLIC METHOD
  // ============================================================================

  /** Open editor with a specific file */
  export function openWithFile(fileToOpen: FileInfo): void {
    file = fileToOpen;
    editorOpen = true;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onDestroy(() => {
    resetGestureState();
  });
</script>

<!-- Button -->
<button
  type="button"
  class="editor-btn"
  class:editor-btn--disabled={disabled}
  class:editor-btn--active={hasFile}
  style:--_size="{s.btn}px"
  style:--_icon-size={s.icon}
  style:--_label-size={s.label}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:contextmenu={handleContextMenu}
  aria-label="Editor de texto"
  aria-disabled={disabled}
  title="Tap: abrir editor | Long press: configuración"
>
  <span class="editor-btn__icon">{currentIcon}</span>
  {#if showLabel}
    <span class="editor-btn__label">{currentLabel}</span>
  {/if}
  {#if hasFile}
    <span class="editor-btn__indicator" />
  {/if}
</button>

<!-- Editor Panel -->
<TextEditorPanel
  bind:open={editorOpen}
  {file}
  {projectId}
  showLineNumbers={settings.showLineNumbers}
  wordWrap={settings.wordWrap}
  tabSize={settings.tabSize}
  on:save={handleEditorSave}
  on:contentChange={handleEditorContentChange}
/>

<!-- Config Panel -->
<TextEditorConfigPanel
  bind:open={configOpen}
  file={file ? { name: file.name, path: file.path, extension: file.extension || '' } : null}
  content={editorContent}
  {projectId}
  bind:settings
  on:format={handleConfigFormat}
  on:settingsChange={handleConfigSettingsChange}
/>

<style>
  .editor-btn {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--editor-btn-bg, hsl(217 91% 60% / 0.15));
    --_bg-hover: var(--editor-btn-bg-hover, hsl(217 91% 60% / 0.25));
    --_bg-active: var(--editor-btn-bg-active, hsl(217 91% 60% / 0.35));
    --_color: var(--editor-btn-color, var(--color-text, #ffffff));
    --_color-muted: var(--editor-btn-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--editor-btn-border, transparent);
    --_border-focus: var(--editor-btn-border-focus, hsl(217 91% 60%));
    --_radius: var(--editor-btn-radius, var(--radius-lg, 12px));
    --_transition: var(--editor-btn-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    position: relative;
    width: var(--_size);
    height: var(--_size);
    min-width: var(--_size);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    /* === APPEARANCE === */
    background: var(--_bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);

    /* === INTERACTION === */
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;

    /* === ANIMATION === */
    transition:
      background var(--_transition) ease,
      transform var(--_transition) ease,
      border-color var(--_transition) ease;
  }

  /* === STATES === */
  .editor-btn:hover:not(.editor-btn--disabled) {
    background: var(--_bg-hover);
  }

  .editor-btn:active:not(.editor-btn--disabled) {
    background: var(--_bg-active);
    transform: scale(0.95);
  }

  .editor-btn:focus-visible {
    outline: none;
    border-color: var(--_border-focus);
    box-shadow: 0 0 0 3px hsl(217 91% 60% / 0.3);
  }

  .editor-btn--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .editor-btn--active {
    --_bg: hsl(217 91% 60% / 0.25);
    border-color: hsl(217 91% 60% / 0.3);
  }

  /* === ICON === */
  .editor-btn__icon {
    font-size: var(--_icon-size);
    line-height: 1;
  }

  /* === LABEL === */
  .editor-btn__label {
    font-size: var(--_label-size);
    font-weight: var(--font-weight-medium, 500);
    color: var(--_color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(var(--_size) - 8px);
  }

  /* === FILE INDICATOR === */
  .editor-btn__indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: hsl(217 91% 60%);
    border-radius: 50%;
  }

  /* === TOUCH DEVICES === */
  @media (hover: none) {
    .editor-btn:active:not(.editor-btn--disabled) {
      background: var(--_bg-active);
    }
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .editor-btn {
      transition: none;
    }
  }
</style>
