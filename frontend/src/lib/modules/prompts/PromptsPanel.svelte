<script lang="ts">
  /**
   * PromptsPanel - Panel de selección de prompts
   *
   * Features:
   * - Lista de prompts disponibles por categoría
   * - Prompts de sistema predefinidos
   * - Crear nuevo prompt (futuro)
   */

  import { activePrompt, selectPrompt, clearPrompt } from '$lib/stores';
  import { closePanel } from '$lib/stores/ui';
  import type { Prompt } from '$lib/ui-core';

  export let panelId: string;

  // Categorías de prompts
  const categories = [
    { id: 'general', name: 'General', icon: '📋' },
    { id: 'code', name: 'Código', icon: '💻' },
    { id: 'creative', name: 'Creativo', icon: '🎨' },
    { id: 'analysis', name: 'Análisis', icon: '📊' }
  ];

  // Demo prompts - en producción vendrían del backend
  const demoPrompts: Prompt[] = [
    { id: '1', name: 'Asistente General', slotType: 'general' },
    { id: '2', name: 'Code Review', slotType: 'code' },
    { id: '3', name: 'Debug Helper', slotType: 'code' },
    { id: '4', name: 'Refactor Expert', slotType: 'code' },
    { id: '5', name: 'Copywriter', slotType: 'creative' },
    { id: '6', name: 'Storyteller', slotType: 'creative' },
    { id: '7', name: 'Data Analyst', slotType: 'analysis' },
    { id: '8', name: 'Report Writer', slotType: 'analysis' }
  ];

  function getPromptsByCategory(category: string): Prompt[] {
    return demoPrompts.filter(p => p.slotType === category);
  }

  function getCategoryIcon(slotType: string): string {
    const cat = categories.find(c => c.id === slotType);
    return cat?.icon || '📝';
  }

  function handleSelect(prompt: Prompt) {
    selectPrompt(prompt);
    closePanel();
  }

  function handleClear() {
    clearPrompt();
    closePanel();
  }
</script>

<div class="prompts-panel">
  {#if $activePrompt}
    <div class="current-prompt">
      <span class="label">Prompt activo:</span>
      <span class="name">{getCategoryIcon($activePrompt.slotType)} {$activePrompt.name}</span>
      <button class="clear-btn" on:click={handleClear}>Quitar</button>
    </div>
  {/if}

  <div class="categories">
    {#each categories as category (category.id)}
      {@const prompts = getPromptsByCategory(category.id)}
      {#if prompts.length > 0}
        <div class="category">
          <h4 class="category-title">
            <span class="category-icon">{category.icon}</span>
            {category.name}
          </h4>
          <div class="prompts-list">
            {#each prompts as prompt (prompt.id)}
              <button
                class="prompt-item"
                class:active={$activePrompt?.id === prompt.id}
                on:click={() => handleSelect(prompt)}
              >
                <span class="prompt-name">{prompt.name}</span>
                {#if $activePrompt?.id === prompt.id}
                  <span class="active-badge">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <div class="actions">
    <button class="new-prompt" disabled>
      ➕ Crear prompt personalizado
    </button>
  </div>
</div>

<style>
  .prompts-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  .current-prompt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--color-active, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    border: 1px solid var(--color-primary, #3b82f6);
  }

  .current-prompt .label {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .current-prompt .name {
    flex: 1;
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
  }

  .clear-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.25rem;
    color: var(--color-text-muted, #a3a3a3);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
  }

  .categories {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    overflow-y: auto;
  }

  .category {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .category-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-muted, #a3a3a3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .category-icon {
    font-size: 1rem;
  }

  .prompts-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .prompt-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    font-size: 0.9375rem;
  }

  .prompt-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--color-border-hover, rgba(255, 255, 255, 0.2));
  }

  .prompt-item.active {
    background: var(--color-active, rgba(59, 130, 246, 0.2));
    border-color: var(--color-primary, #3b82f6);
  }

  .prompt-name {
    flex: 1;
  }

  .active-badge {
    color: var(--color-primary, #3b82f6);
    font-weight: bold;
  }

  .actions {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .new-prompt {
    width: 100%;
    padding: 0.625rem 1rem;
    background: transparent;
    border: 1px dashed var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.375rem;
    color: var(--color-text-muted, #a3a3a3);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
  }

  .new-prompt:hover:not(:disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--color-text-muted, #a3a3a3);
  }

  .new-prompt:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
