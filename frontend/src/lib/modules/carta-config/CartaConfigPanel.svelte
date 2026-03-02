<script lang="ts">
  /**
   * CartaConfigPanel - Configuración de carta digital
   *
   * Carga y guarda config real via:
   *   mqttRequest('carta-digital', 'config', { project_id })
   *   mqttRequest('carta-digital', 'update-config', { project_id, ...fields })
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  let loading = true;
  let saving = false;
  let error = '';
  let saved = false;

  // Config fields — match backend defaultConfig()
  let whatsapp_telefono = '';
  let nombre_negocio = '';
  let moneda = '€';
  let mensaje_header = '¡Hola! Quiero pedir:';
  let color_primario = '#f59e0b';
  let color_fondo = '#0a0a0a';
  let color_texto = '#e5e5e5';
  let logo_emoji = '🍕';
  let carrito = true;
  let whatsapp_enabled = true;
  let compartir = true;
  let variaciones = true;

  onMount(() => loadConfig());

  async function loadConfig() {
    loading = true;
    error = '';
    try {
      const res = await mqttRequest<any>('carta-digital', 'config', { project_id: projectId });
      const d = res.data || res;
      whatsapp_telefono = d.whatsapp_telefono || '';
      nombre_negocio = d.nombre_negocio || '';
      moneda = d.moneda || '€';
      mensaje_header = d.mensaje_header || '';
      if (d.tema) {
        color_primario = d.tema.color_primario || '#f59e0b';
        color_fondo = d.tema.color_fondo || '#0a0a0a';
        color_texto = d.tema.color_texto || '#e5e5e5';
        logo_emoji = d.tema.logo_emoji || '🍕';
      }
      if (d.funcionalidades) {
        carrito = d.funcionalidades.carrito ?? true;
        whatsapp_enabled = d.funcionalidades.whatsapp ?? true;
        compartir = d.funcionalidades.compartir ?? true;
        variaciones = d.funcionalidades.variaciones ?? true;
      }
    } catch (err: any) {
      error = err.message || 'Error cargando config';
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    saving = true;
    error = '';
    saved = false;
    try {
      await mqttRequest('carta-digital', 'update-config', {
        project_id: projectId,
        whatsapp_telefono,
        nombre_negocio,
        moneda,
        mensaje_header,
        tema: { color_primario, color_fondo, color_texto, logo_emoji },
        funcionalidades: { carrito, whatsapp: whatsapp_enabled, compartir, variaciones }
      });
      saved = true;
      setTimeout(() => saved = false, 2000);
    } catch (err: any) {
      error = err.message || 'Error guardando config';
    } finally {
      saving = false;
    }
  }
</script>

<div class="panel-body">
  {#if loading}
    <div class="loading">Cargando configuración...</div>
  {:else}
    <div class="form-group">
      <label class="form-label" for="cc-name">Nombre del negocio</label>
      <input id="cc-name" class="form-input" type="text" bind:value={nombre_negocio} />
    </div>

    <div class="form-group">
      <label class="form-label" for="cc-whatsapp">WhatsApp (con prefijo país)</label>
      <input id="cc-whatsapp" class="form-input" type="tel" bind:value={whatsapp_telefono} placeholder="34612345678" />
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="cc-moneda">Moneda</label>
        <input id="cc-moneda" class="form-input" type="text" bind:value={moneda} />
      </div>
      <div class="form-group compact">
        <label class="form-label" for="cc-emoji">Logo emoji</label>
        <input id="cc-emoji" class="form-input" type="text" bind:value={logo_emoji} />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="cc-header">Mensaje pedido</label>
      <input id="cc-header" class="form-input" type="text" bind:value={mensaje_header} />
    </div>

    <div class="form-row">
      <div class="form-group compact">
        <label class="form-label" for="cc-color">Color primario</label>
        <div class="color-row">
          <input id="cc-color" type="color" bind:value={color_primario} />
          <span class="color-hex">{color_primario}</span>
        </div>
      </div>
      <div class="form-group compact">
        <label class="form-label" for="cc-bg">Fondo</label>
        <div class="color-row">
          <input id="cc-bg" type="color" bind:value={color_fondo} />
          <span class="color-hex">{color_fondo}</span>
        </div>
      </div>
    </div>

    <div class="features">
      <span class="form-label">Funcionalidades</span>
      <label class="checkbox-row"><input type="checkbox" bind:checked={carrito} /><span>Carrito</span></label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={whatsapp_enabled} /><span>WhatsApp</span></label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={compartir} /><span>Compartir</span></label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={variaciones} /><span>Variaciones</span></label>
    </div>

    <button class="btn-action" on:click={handleSave} disabled={saving}>
      {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar configuración'}
    </button>

    {#if error}
      <div class="error-msg">{error}</div>
    {/if}
  {/if}
</div>

<style>
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }
  .loading { text-align: center; color: var(--color-text-muted, #888); font-size: 0.8rem; padding: 1rem; }
  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group.compact { flex: 1; min-width: 0; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-input {
    padding: 0.4rem 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.8rem;
  }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-row { display: flex; gap: 0.5rem; }
  .color-row { display: flex; align-items: center; gap: 0.5rem; }
  .color-row input[type="color"] {
    width: 2rem; height: 2rem;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 0.25rem;
    background: none; cursor: pointer;
  }
  .color-hex { font-size: 0.7rem; font-family: monospace; color: var(--color-text-muted, #888); }
  .features { display: flex; flex-direction: column; gap: 0.3rem; }
  .checkbox-row {
    display: flex; align-items: center; gap: 0.5rem;
    cursor: pointer; font-size: 0.8rem; color: var(--color-text, #e5e5e5);
  }
  .btn-action {
    padding: 0.6rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none; border-radius: 0.375rem;
    color: white; font-size: 0.8rem; font-weight: 600; cursor: pointer;
  }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg {
    padding: 0.4rem 0.5rem;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 0.375rem;
    color: var(--color-error, #ef4444); font-size: 0.75rem;
  }
</style>
