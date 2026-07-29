<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let visible: boolean = true;
  export let cuenta_id: string = '';

  const dispatch = createEventDispatcher<{
    close: void;
    success: { id: string };
    error: { message: string };
  }>();

  let loading = false;
  let error: string | null = null;

  async function handleSubmit() {
    loading = true;
    error = null;
    try {
      const res = await mqttRequest('midominio', 'accion', { cuenta_id });
      if (res?.status === 200 || res?.status === 201) {
        dispatch('success', { id: res.data?.id });
      } else {
        error = res?.error || 'Error';
      }
    } catch (err: any) {
      error = err?.message || 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" on:click={handleClose}>
    <div class="panel" on:click|stopPropagation>
      <header class="panel-header">
        <h3>Título</h3>
        <button class="close-btn" on:click={handleClose}>✕</button>
      </header>
      <div class="panel-content">
        {#if error}
          <div class="error">❌ {error}</div>
        {/if}
        <p>Contenido del panel</p>
      </div>
      <footer class="panel-footer">
        <button class="btn-secondary" on:click={handleClose}>Cancelar</button>
        <button class="btn-primary" on:click={handleSubmit} disabled={loading}>
          {loading ? '⏳...' : 'Confirmar'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .panel {
    background: #1a1a1a; border-radius: 12px;
    width: 90%; max-width: 480px; max-height: 90vh;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .panel-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid #333;
  }
  .panel-header h3 { margin: 0; font-size: 1.1rem; }
  .close-btn {
    background: none; border: none; color: #888; font-size: 1.2rem;
    cursor: pointer; padding: 4px 8px;
  }
  .close-btn:hover { color: #fff; }
  .panel-content { flex: 1; overflow-y: auto; padding: 20px; }
  .panel-footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 12px 20px; border-top: 1px solid #333;
  }
  .error {
    background: rgba(239,68,68,0.15); color: #fca5a5;
    padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;
  }
  .btn-primary, .btn-secondary {
    padding: 10px 20px; border-radius: 8px; border: none;
    font-size: 0.9rem; cursor: pointer; font-weight: 600;
  }
  .btn-primary { background: #3b82f6; color: #fff; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: #333; color: #ccc; }
</style>
