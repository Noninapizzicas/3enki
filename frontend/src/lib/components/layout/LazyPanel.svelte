<script lang="ts">
  /**
   * LazyPanel - Panel con carga bajo demanda
   *
   * Carga el componente solo cuando se abre.
   * Usa cache para cargas posteriores instantáneas.
   */
  import { createEventDispatcher } from 'svelte';
  import Panel from './Panel.svelte';
  import { getPanel, loadPanelComponent, isPanelLoaded } from '$lib/modules/panels';
  import type { ComponentType } from 'svelte';

  export let panelId: string;
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let Component: ComponentType | null = null;
  let loading = false;
  let error: string | null = null;

  // Cargar cuando se abre
  $: if (open && panelId && !Component) {
    loadComponent();
  }

  async function loadComponent() {
    if (loading) return;

    loading = true;
    error = null;

    try {
      Component = await loadPanelComponent(panelId);
      if (!Component) {
        error = 'No se pudo cargar el panel';
      }
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }

  $: panel = getPanel(panelId);
  $: isLoaded = isPanelLoaded(panelId);
</script>

{#if open && panel}
  <Panel
    title={panel.title}
    size={panel.size}
    position={panel.position || 'top'}
    resizable={true}
    {open}
    on:close={handleClose}
  >
    {#if loading}
      <div class="loading">
        <span class="spinner"></span>
        <span>Cargando {panel.title}...</span>
      </div>
    {:else if error}
      <div class="error">
        <span>❌</span>
        <span>{error}</span>
        <button on:click={loadComponent}>Reintentar</button>
      </div>
    {:else if Component}
      <svelte:component this={Component} {panelId} />
    {/if}
  </Panel>
{/if}

<style>
  .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    color: var(--color-text-muted, #888);
    text-align: center;
  }

  .error {
    color: var(--color-error, #ef4444);
  }

  .error button {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #2a2a2a);
    border: 1px solid var(--color-border, #444);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    cursor: pointer;
  }

  .error button:hover {
    background: var(--color-bg-hover, #333);
  }

  .spinner {
    display: inline-block;
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--color-border, #444);
    border-top-color: var(--color-primary, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
