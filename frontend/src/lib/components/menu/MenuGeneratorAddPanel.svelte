<!--
  MenuGeneratorAddPanel.svelte
  Panel para crear nueva conversación de menú con selección de template.

  Eventos:
  - create: { title, templateId, aiConfig }
  - cancel
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import FloatingPanel from '../feedback/FloatingPanel.svelte';
  import { api } from '$lib/config';

  export let open = false;

  interface Template {
    id: string;
    name: string;
    emoji: string;
    description: string;
    categories: string[];
  }

  const dispatch = createEventDispatcher<{
    create: {
      title: string;
      templateId: string | null;
      aiConfig: { provider: string; temperature: number };
    };
    cancel: void;
  }>();

  // Estado del formulario
  let title = '';
  let selectedTemplate: string | null = null;
  let provider = 'deepseek';
  let temperature = 0.7;

  // Templates disponibles
  let templates: Template[] = [];
  let loading = true;
  let error = '';

  // Cargar templates al abrir
  $: if (open) {
    loadTemplates();
    resetForm();
  }

  async function loadTemplates() {
    loading = true;
    error = '';

    try {
      const res = await fetch(api.moduleApi('menu-generator', '/templates'));
      if (!res.ok) throw new Error('Error cargando templates');

      const data = await res.json();
      templates = data.templates || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error desconocido';
      // Templates por defecto si falla
      templates = [
        { id: 'tpl_restaurante_italiano', name: 'Italiano', emoji: '🍝', description: 'Pasta, pizza, antipasti', categories: [] },
        { id: 'tpl_restaurante_japones', name: 'Japonés', emoji: '🍣', description: 'Sushi, ramen, tempura', categories: [] },
        { id: 'tpl_cafeteria', name: 'Cafetería', emoji: '☕', description: 'Desayunos, brunch, café', categories: [] },
        { id: 'tpl_bar_tapas', name: 'Tapas', emoji: '🍻', description: 'Tapas, raciones, vinos', categories: [] },
        { id: 'tpl_comida_rapida', name: 'Fast Food', emoji: '🍔', description: 'Hamburguesas, combos', categories: [] }
      ];
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    title = '';
    selectedTemplate = null;
    provider = 'deepseek';
    temperature = 0.7;
  }

  function selectTemplate(id: string) {
    selectedTemplate = selectedTemplate === id ? null : id;

    // Auto-generar título si está vacío
    if (selectedTemplate && !title) {
      const tpl = templates.find(t => t.id === id);
      if (tpl) {
        title = `Menú ${tpl.name}`;
      }
    }
  }

  async function handleCreate() {
    dispatch('create', {
      title: title || 'Nueva conversación',
      templateId: selectedTemplate,
      aiConfig: { provider, temperature }
    });
    open = false;
  }

  function handleCancel() {
    dispatch('cancel');
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && title) {
      e.preventDefault();
      handleCreate();
    }
  }
</script>

<FloatingPanel bind:open on:close={handleCancel}>
  <div class="add-panel">
    <header class="panel-header">
      <span class="header-icon">🍽️</span>
      <h3>Nuevo Menú</h3>
    </header>

    <div class="panel-body">
      <!-- Título -->
      <div class="field">
        <label for="menu-title">Nombre</label>
        <input
          id="menu-title"
          type="text"
          bind:value={title}
          on:keydown={handleKeydown}
          placeholder="Ej: Carta Restaurante Luna"
          autocomplete="off"
        />
      </div>

      <!-- Templates -->
      <div class="field">
        <label>Plantilla (opcional)</label>
        {#if loading}
          <div class="loading">Cargando plantillas...</div>
        {:else}
          <div class="templates-grid">
            {#each templates as tpl}
              <button
                type="button"
                class="template-card"
                class:selected={selectedTemplate === tpl.id}
                on:click={() => selectTemplate(tpl.id)}
              >
                <span class="tpl-emoji">{tpl.emoji}</span>
                <span class="tpl-name">{tpl.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Config AI (colapsable) -->
      <details class="ai-config">
        <summary>Configuración IA</summary>
        <div class="config-fields">
          <div class="field-row">
            <label for="ai-provider">Proveedor</label>
            <select id="ai-provider" bind:value={provider}>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div class="field-row">
            <label for="ai-temp">Creatividad</label>
            <input
              id="ai-temp"
              type="range"
              min="0"
              max="1"
              step="0.1"
              bind:value={temperature}
            />
            <span class="temp-value">{temperature}</span>
          </div>
        </div>
      </details>
    </div>

    <footer class="panel-footer">
      <button type="button" class="btn-cancel" on:click={handleCancel}>
        Cancelar
      </button>
      <button
        type="button"
        class="btn-create"
        on:click={handleCreate}
      >
        Crear
      </button>
    </footer>
  </div>
</FloatingPanel>

<style>
  .add-panel {
    --_accent: var(--menu-accent, hsl(25 95% 53%));
    --_bg: var(--panel-bg, var(--color-bg-card, hsl(220 13% 14%)));
    --_text: var(--panel-text, var(--color-text, hsl(220 10% 90%)));
    --_text-muted: var(--color-text-secondary, hsl(220 10% 60%));
    --_border: var(--color-border, hsl(220 13% 20%));
    --_radius: var(--radius-md, 8px);

    width: min(360px, 90vw);
    background: var(--_bg);
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: linear-gradient(135deg, hsla(25, 95%, 53%, 0.15), transparent);
    border-bottom: 1px solid var(--_border);
  }

  .header-icon {
    font-size: 1.25rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--_text);
  }

  .panel-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .field label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--_text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .field input[type="text"] {
    padding: 0.625rem 0.75rem;
    background: hsla(220, 13%, 50%, 0.1);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    color: var(--_text);
    font-size: 0.875rem;
  }

  .field input:focus {
    outline: none;
    border-color: var(--_accent);
    box-shadow: 0 0 0 2px hsla(25, 95%, 53%, 0.2);
  }

  .loading {
    padding: 1rem;
    text-align: center;
    color: var(--_text-muted);
    font-size: 0.875rem;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    background: hsla(220, 13%, 50%, 0.1);
    border: 2px solid transparent;
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .template-card:hover {
    background: hsla(220, 13%, 50%, 0.15);
    border-color: var(--_border);
  }

  .template-card.selected {
    background: hsla(25, 95%, 53%, 0.15);
    border-color: var(--_accent);
  }

  .tpl-emoji {
    font-size: 1.5rem;
  }

  .tpl-name {
    font-size: 0.75rem;
    color: var(--_text);
    text-align: center;
  }

  .ai-config {
    padding: 0.75rem;
    background: hsla(220, 13%, 50%, 0.05);
    border-radius: var(--_radius);
  }

  .ai-config summary {
    font-size: 0.75rem;
    color: var(--_text-muted);
    cursor: pointer;
    user-select: none;
  }

  .ai-config[open] summary {
    margin-bottom: 0.75rem;
  }

  .config-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .field-row label {
    flex: 0 0 80px;
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  .field-row select {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: hsla(220, 13%, 50%, 0.1);
    border: 1px solid var(--_border);
    border-radius: 4px;
    color: var(--_text);
    font-size: 0.8125rem;
  }

  .field-row input[type="range"] {
    flex: 1;
    accent-color: var(--_accent);
  }

  .temp-value {
    width: 2rem;
    font-size: 0.75rem;
    color: var(--_text-muted);
    text-align: right;
  }

  .panel-footer {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--_border);
  }

  .btn-cancel,
  .btn-create {
    flex: 1;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: var(--_radius);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel {
    background: hsla(220, 13%, 50%, 0.1);
    color: var(--_text-muted);
  }

  .btn-cancel:hover {
    background: hsla(220, 13%, 50%, 0.2);
  }

  .btn-create {
    background: var(--_accent);
    color: white;
  }

  .btn-create:hover {
    filter: brightness(1.1);
  }

  .btn-create:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
