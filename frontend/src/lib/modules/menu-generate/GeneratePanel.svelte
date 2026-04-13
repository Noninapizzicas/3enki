<script lang="ts">
  /**
   * GeneratePanel — Panel unificado de generación de cartas
   *
   * Acepta CUALQUIER input:
   * - Texto pegado (OCR, dictado, lista, JSON)
   * - Archivo subido (PDF, foto)
   *
   * Siempre pide nombre. Muestra progreso del pipeline.
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    generationStore,
    generationStep,
    generationError,
    generationResult,
    isGenerating,
    generateFromText,
    generateFromFile,
    resetGeneration,
    initGenerationSubscriptions
  } from '$lib/stores/menu-generator';
  import { updatePageStateBatch } from '$lib/stores/page-context';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;
  let nombre = '';
  let texto = '';
  let filePath = '';
  let inputMode: 'text' | 'file' = 'text';

  $: step = $generationStep;
  $: error = $generationError;
  $: result = $generationResult;
  $: generating = $isGenerating;
  $: canGenerate = nombre.trim() && (inputMode === 'text' ? texto.trim() : filePath.trim());

  onMount(() => {
    cleanup = initGenerationSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  async function handleGenerate() {
    if (!nombre.trim()) return;

    updatePageStateBatch({
      pipelineStep: 'generating',
      generatingNombre: nombre.trim()
    });

    if (inputMode === 'file' && filePath.trim()) {
      await generateFromFile(nombre.trim(), filePath.trim());
    } else if (texto.trim()) {
      await generateFromText(nombre.trim(), texto.trim());
    }
  }

  function handleReset() {
    resetGeneration();
    nombre = '';
    texto = '';
    filePath = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canGenerate) {
      handleGenerate();
    }
  }

  const STEP_LABELS: Record<string, string> = {
    extracting: 'Extrayendo texto del documento...',
    structuring: 'Estructurando carta con IA...',
    done: 'Carta generada',
    error: 'Error en la generacion'
  };
</script>

<div class="panel-body">

  <!-- NOMBRE (siempre visible, siempre primero) -->
  <div class="form-group">
    <label class="form-label" for="gen-nombre">
      Nombre de la carta <span class="required">*</span>
    </label>
    <input
      id="gen-nombre"
      type="text"
      class="form-input"
      placeholder="Carta Pizzicas, Menu Nocturno..."
      bind:value={nombre}
      disabled={generating}
    />
  </div>

  <!-- TABS: Texto / Archivo -->
  {#if step === 'idle' || step === 'error'}
    <div class="input-tabs">
      <button
        class="tab" class:active={inputMode === 'text'}
        on:click={() => inputMode = 'text'}>Texto</button>
      <button
        class="tab" class:active={inputMode === 'file'}
        on:click={() => inputMode = 'file'}>Archivo</button>
    </div>

    {#if inputMode === 'text'}
      <div class="form-group">
        <textarea
          class="form-textarea"
          placeholder="Pega aqui el texto: OCR, lista de productos, dictado, JSON...

Ejemplo:
PIZZAS
Margarita 8.50
Tomate, mozzarella, albahaca

ENTRANTES
Patatas bravas 4.00"
          rows="10"
          bind:value={texto}
          on:keydown={handleKeydown}
        ></textarea>
        <span class="form-hint">
          {texto.length > 0 ? `${texto.length} chars · ` : ''}Ctrl+Enter para generar
        </span>
      </div>
    {:else}
      <div class="form-group">
        <label class="form-label" for="gen-file">Ruta al archivo (PDF o imagen)</label>
        <input
          id="gen-file"
          type="text"
          class="form-input"
          placeholder="/pizzepos/carta-foto.jpg o /pizzepos/menu.pdf"
          bind:value={filePath}
          on:keydown={handleKeydown}
        />
        <span class="form-hint">
          PDF, JPG, PNG, WebP, TIFF · Se procesara con Google Vision OCR
        </span>
      </div>
    {/if}

    <!-- BOTON GENERAR -->
    <button
      class="btn-action"
      on:click={handleGenerate}
      disabled={!canGenerate || generating}
    >
      Generar Carta
    </button>
  {/if}

  <!-- PROGRESO -->
  {#if generating}
    <div class="progress-box">
      <div class="progress-spinner"></div>
      <div class="progress-text">
        <strong>{STEP_LABELS[step] || step}</strong>
        <span class="progress-nombre">{nombre}</span>
      </div>
    </div>
  {/if}

  <!-- RESULTADO -->
  {#if step === 'done' && result}
    <div class="result-box">
      <div class="result-title">Carta generada</div>
      <div class="result-stats">
        <span><strong>{result.nombre}</strong></span>
        <span>{result.productos} productos · {result.categorias} categorias</span>
      </div>
      <button class="btn-secondary" on:click={handleReset}>
        Generar otra
      </button>
    </div>
  {/if}

  <!-- ERROR -->
  {#if step === 'error' && error}
    <div class="error-msg">
      <span>{error}</span>
      <button class="close-btn" on:click={handleReset}>Reintentar</button>
    </div>
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-label .required { color: var(--color-error, #ef4444); }

  .form-input {
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }

  .form-textarea {
    padding: 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
    font-family: monospace;
    resize: vertical;
    min-height: 120px;
    line-height: 1.5;
  }
  .form-textarea:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-hint { font-size: 0.6rem; color: var(--color-text-muted, #666); text-align: right; }

  .input-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .tab {
    flex: 1;
    padding: 0.4rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted, #888);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .tab.active {
    color: var(--color-text, #e5e5e5);
    border-bottom-color: var(--color-primary, #3b82f6);
  }

  .btn-action {
    padding: 0.65rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-secondary {
    padding: 0.45rem 0.65rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.12); }

  .progress-box {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 0.375rem;
  }
  .progress-spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(59,130,246,0.3);
    border-top-color: var(--color-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress-text { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.8rem; }
  .progress-nombre { font-size: 0.7rem; color: var(--color-text-muted, #888); }

  .result-box {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: 0.375rem;
  }
  .result-title { font-size: 0.8rem; font-weight: 600; color: var(--color-success, #22c55e); }
  .result-stats { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; }

  .error-msg {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }
  .close-btn {
    background: none;
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.25rem;
    color: inherit;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
  }
</style>
