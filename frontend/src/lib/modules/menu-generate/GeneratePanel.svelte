<script lang="ts">
  /**
   * GeneratePanel - Genera carta estructurada desde texto via IA
   *
   * Textarea para pegar texto (OCR, manual, JSON crudo),
   * nombre, provider. Usa el store compartido menu-generator.
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    menuGenerating,
    menuError,
    initMenuGeneratorSubscriptions,
    generateMenu,
    clearError
  } from '$lib/stores/menu-generator';

  export let panelId: string = '';

  let cleanup: (() => void) | null = null;
  let texto = '';
  let nombre = '';
  let provider = 'auto';

  $: generating = $menuGenerating;
  $: error = $menuError;

  onMount(() => {
    cleanup = initMenuGeneratorSubscriptions();
  });

  onDestroy(() => {
    cleanup?.();
  });

  async function handleGenerate() {
    if (!texto.trim()) return;

    const success = await generateMenu(texto.trim(), nombre.trim() || undefined, provider);
    if (success) {
      texto = '';
      nombre = '';
      provider = 'auto';
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleGenerate();
    }
  }
</script>

<div class="panel-body">
  <div class="form-group">
    <label class="form-label" for="gen-nombre">Nombre de la carta</label>
    <input
      id="gen-nombre"
      type="text"
      class="form-input"
      placeholder="Carta Pizzicas, Menu Restaurante..."
      bind:value={nombre}
    />
  </div>

  <div class="form-group">
    <label class="form-label" for="gen-texto">
      Contenido
      <span class="required">*</span>
    </label>
    <textarea
      id="gen-texto"
      class="form-textarea"
      placeholder="Pega aqui el texto de la carta, resultado OCR, o JSON crudo...

Ejemplo:
PIZZAS
Margarita 8.50
Tomate, mozzarella, albahaca

Country 11.50
Tomate, BBQ, nata, pollo, quesos, cebolla, bacon"
      rows="10"
      bind:value={texto}
      on:keydown={handleKeydown}
    ></textarea>
    <span class="form-hint">
      {texto.length > 0 ? `${texto.length} chars` : 'Ctrl+Enter para generar'}
    </span>
  </div>

  <div class="form-group">
    <label class="form-label" for="gen-provider">Provider AI</label>
    <select id="gen-provider" class="form-input" bind:value={provider}>
      <option value="auto">Automatico</option>
      <option value="deepseek">DeepSeek</option>
      <option value="anthropic">Anthropic</option>
      <option value="openai">OpenAI</option>
    </select>
  </div>

  <button
    class="btn-action"
    on:click={handleGenerate}
    disabled={!texto.trim() || generating}
  >
    {#if generating}
      Generando carta...
    {:else}
      ✨ Generar Carta
    {/if}
  </button>

  {#if generating}
    <div class="info-box">
      La IA esta analizando el texto y estructurando la carta.
    </div>
  {/if}

  {#if error}
    <div class="error-msg">
      <span>{error}</span>
      <button class="close-btn" on:click={clearError}>✕</button>
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

  .form-hint {
    font-size: 0.6rem;
    color: var(--color-text-muted, #666);
    text-align: right;
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

  .info-box {
    text-align: center;
    padding: 0.5rem;
    background: rgba(59,130,246,0.1);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }

  .error-msg {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444);
    font-size: 0.75rem;
  }
  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.15rem;
  }
</style>
