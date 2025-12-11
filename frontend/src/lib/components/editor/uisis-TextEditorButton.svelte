<!--
  TextEditorButton.svelte
  =======================
  Botón unificado para editor de texto con DOBLE interacción.
  Usa GestureButton como base para el manejo de gestos.

  Gestos (según UI-SYSTEM-PLAN.md):
  - Tap/Click: Abre el editor con el archivo actual (si hay)
  - Long press / Click derecho: Abre TextEditorConfigPanel (configuración)

  text-editor usa enableAdd=false (archivos se crean desde file-browser).

  Skinnable via CSS Variables:
  --gesture-btn-bg, --gesture-btn-bg-hover, --gesture-btn-bg-active

  Uso:
    <TextEditorButton
      size="md"
      {file}
      {projectId}
      on:openEditor={handleOpenEditor}
      on:config={handleConfig}
      on:save={handleSave}
    />

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GestureButton } from '$components/ui';
  import TextEditorPanel from './uisis-TextEditorPanel.svelte';
  import TextEditorConfigPanel from './uisis-TextEditorConfigPanel.svelte';
  import type { FileInfo } from './uisis-TextEditorPanel.svelte';
  import type { EditorSettings } from './uisis-TextEditorConfigPanel.svelte';

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

  const currentIcon = '📝';
  const currentLabel = 'Editor';

  // ============================================================================
  // COMPUTED
  // ============================================================================

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
  // GESTURE HANDLERS
  // ============================================================================

  function handleGestureSelect(): void {
    editorOpen = true;
    dispatch('openEditor', { file });
  }

  function handleGestureConfig(): void {
    configOpen = true;
    dispatch('config');
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
</script>

<!-- Button con GestureButton base -->
<div
  class="editor-btn-wrapper"
  class:editor-btn-wrapper--active={hasFile}
  style:--gesture-btn-bg="hsl(217 91% 60% / 0.15)"
  style:--gesture-btn-bg-hover="hsl(217 91% 60% / 0.25)"
  style:--gesture-btn-bg-active="hsl(217 91% 60% / 0.35)"
  style:--gesture-btn-border-focus="hsl(217 91% 60%)"
>
  <GestureButton
    {size}
    icon={currentIcon}
    label={currentLabel}
    {showLabel}
    {disabled}
    enableAdd={false}
    ariaLabel="Editor de texto"
    on:select={handleGestureSelect}
    on:config={handleGestureConfig}
  />
  {#if hasFile}
    <span class="editor-btn__indicator" />
  {/if}
</div>

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
  .editor-btn-wrapper {
    position: relative;
    display: contents;
  }

  .editor-btn-wrapper--active :global(.gesture-btn) {
    --gesture-btn-bg: hsl(217 91% 60% / 0.25);
    border-color: hsl(217 91% 60% / 0.3);
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
    pointer-events: none;
  }
</style>
