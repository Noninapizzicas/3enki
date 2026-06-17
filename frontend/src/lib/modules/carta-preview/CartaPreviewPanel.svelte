<script lang="ts">
  /**
   * CartaPreviewPanel — vista previa del PWA SIN DOMINIO.
   *
   * Pide cartadigital.preview → HTML real (generateStaticHTML, variante suelta con
   * checkout WhatsApp) → lo mete en un <iframe srcdoc>. Toggle móvil/escritorio.
   * Es exactamente lo que verá el cliente, no una maqueta.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { activeProjectId } from '$lib/stores/projects';

  export let panelId: string = '';

  let viewMode: 'mobile' | 'desktop' = 'mobile';
  let html = '';
  let productos = 0;
  let loading = false;
  let error = '';

  async function cargar() {
    const project_id = get(activeProjectId);
    if (!project_id) { error = 'Selecciona un proyecto para previsualizar.'; return; }
    loading = true; error = '';
    try {
      const res = await mqttRequest<{ html: string; productos: number }>(
        'cartadigital', 'preview', { project_id }
      );
      html = res.data?.html || '';
      productos = res.data?.productos || 0;
      if (!html) error = 'No hay carta para previsualizar (¿el proyecto tiene carta asignada?).';
    } catch (e: any) {
      error = e?.message || 'No se pudo generar el preview';
      html = '';
    } finally {
      loading = false;
    }
  }

  onMount(cargar);
</script>

<div class="prev">
  <div class="bar">
    <div class="modes">
      <button class:active={viewMode === 'mobile'} on:click={() => (viewMode = 'mobile')}>📱 Móvil</button>
      <button class:active={viewMode === 'desktop'} on:click={() => (viewMode = 'desktop')}>🖥 Desktop</button>
    </div>
    <div class="right">
      {#if productos > 0}<span class="count">{productos} productos</span>{/if}
      <button class="refresh" on:click={cargar} disabled={loading}>{loading ? '…' : '↻ Refrescar'}</button>
    </div>
  </div>

  {#if error}
    <div class="err">{error}</div>
  {:else if loading && !html}
    <div class="muted">Generando preview…</div>
  {:else if html}
    <div class="stage">
      <div class="frame {viewMode}">
        <iframe title="Preview del PWA" srcdoc={html} sandbox="allow-scripts"></iframe>
      </div>
    </div>
  {:else}
    <div class="muted">Sin carta para previsualizar.</div>
  {/if}
</div>

<style>
  .prev { display: flex; flex-direction: column; gap: 10px; padding: 12px; height: 100%; color: var(--text, #e5e5e5); }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .modes { display: flex; gap: 6px; }
  .modes button, .refresh {
    background: transparent; color: var(--text-muted, #9aa0a6);
    border: 1px solid var(--border, #333); border-radius: 8px;
    padding: 6px 10px; font-size: .8rem; cursor: pointer;
  }
  .modes button.active { background: var(--primary, #f59e0b); color: #1a1205; border-color: transparent; font-weight: 700; }
  .right { display: flex; align-items: center; gap: 8px; }
  .count { font-size: .75rem; color: var(--text-muted, #9aa0a6); }
  .stage { flex: 1; display: flex; justify-content: center; overflow: auto; background: #050505; border-radius: 12px; padding: 12px; }
  .frame { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
  .frame.mobile { width: 390px; max-width: 100%; height: 720px; }
  .frame.desktop { width: 100%; height: 720px; }
  .frame iframe { width: 100%; height: 100%; border: 0; display: block; }
  .muted { color: var(--text-muted, #9aa0a6); font-size: .9rem; padding: 20px; text-align: center; }
  .err { background: #3a1212; color: #ff8a8a; padding: 12px; border-radius: 10px; font-size: .85rem; }
</style>
