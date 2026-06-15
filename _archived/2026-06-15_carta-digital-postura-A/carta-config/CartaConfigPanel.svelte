<script lang="ts">
  /**
   * CartaConfigPanel - Configuración de carta digital.
   *
   * Lee/escribe directo /carta-digital.json del proyecto activo via fs.read
   * + fs.write (patron lecturas-frontend-via-fs-read §5b — sin listeners
   * activos de cartadigital.config.actualizada en el repo). El blueprint
   * sigue intocado: cuando el LLM ejecuta operaciones del blueprint, lee
   * el mismo archivo y opera sobre los campos que necesite.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

  export let panelId: string = '';

  $: projectId = $page.params.project_id;

  const CARTA_DIGITAL_PATH = '/carta-digital.json';

  let loading = true;
  let saving = false;
  let error = '';
  let saved = false;

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

  async function readStore(): Promise<Record<string, any> | null> {
    try {
      const res = await mqttRequest<{ content: string }>('fs', 'read', { path: CARTA_DIGITAL_PATH });
      const content = res.data?.content;
      if (typeof content !== 'string') return null;
      return JSON.parse(content);
    } catch (err) {
      if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
      throw err;
    }
  }

  async function loadConfig() {
    loading = true;
    error = '';
    try {
      const d = (await readStore()) || {};
      whatsapp_telefono = d.whatsapp_telefono || d.contacto?.telefono || '';
      nombre_negocio = d.nombre_negocio || d.branding?.nombre || '';
      moneda = d.moneda || '€';
      mensaje_header = d.mensaje_header || '';
      const tema = d.tema || {};
      color_primario = tema.color_primario || '#f59e0b';
      color_fondo = tema.color_fondo || '#0a0a0a';
      color_texto = tema.color_texto || '#e5e5e5';
      logo_emoji = tema.logo_emoji || '🍕';
      const f = d.funcionalidades || {};
      carrito = f.carrito ?? true;
      whatsapp_enabled = f.whatsapp ?? true;
      compartir = f.compartir ?? true;
      variaciones = f.variaciones ?? true;
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
      const current = (await readStore()) || {};
      const next = {
        ...current,
        whatsapp_telefono,
        nombre_negocio,
        moneda,
        mensaje_header,
        tema: { color_primario, color_fondo, color_texto, logo_emoji },
        funcionalidades: { carrito, whatsapp: whatsapp_enabled, compartir, variaciones },
        _updated_at: new Date().toISOString()
      };
      await mqttRequest('fs', 'write', {
        path: CARTA_DIGITAL_PATH,
        content: JSON.stringify(next, null, 2)
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
    <div class="state-msg">Cargando configuración...</div>
  {:else}
    <div class="form-section">
      <h4 class="section-title">Negocio</h4>
      <div class="form-group">
        <label class="form-label" for="cd-nombre">Nombre del negocio</label>
        <input id="cd-nombre" class="form-input" bind:value={nombre_negocio} placeholder="Mi Pizzería" />
      </div>
      <div class="form-group">
        <label class="form-label" for="cd-wapp">WhatsApp (con prefijo, sin +)</label>
        <input id="cd-wapp" class="form-input" bind:value={whatsapp_telefono} placeholder="34666777888" />
      </div>
      <div class="form-row">
        <div class="form-group compact">
          <label class="form-label" for="cd-moneda">Moneda</label>
          <input id="cd-moneda" class="form-input" bind:value={moneda} placeholder="€" />
        </div>
        <div class="form-group compact">
          <label class="form-label" for="cd-emoji">Logo emoji</label>
          <input id="cd-emoji" class="form-input" bind:value={logo_emoji} placeholder="🍕" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="cd-msg">Mensaje header</label>
        <input id="cd-msg" class="form-input" bind:value={mensaje_header} placeholder="¡Hola! Quiero pedir:" />
      </div>
    </div>

    <div class="form-section">
      <h4 class="section-title">Tema</h4>
      <div class="form-row">
        <div class="form-group compact">
          <label class="form-label" for="cd-cp">Primario</label>
          <input id="cd-cp" class="form-input" type="color" bind:value={color_primario} />
        </div>
        <div class="form-group compact">
          <label class="form-label" for="cd-cf">Fondo</label>
          <input id="cd-cf" class="form-input" type="color" bind:value={color_fondo} />
        </div>
        <div class="form-group compact">
          <label class="form-label" for="cd-ct">Texto</label>
          <input id="cd-ct" class="form-input" type="color" bind:value={color_texto} />
        </div>
      </div>
    </div>

    <div class="form-section">
      <h4 class="section-title">Funcionalidades</h4>
      <label class="check-row"><input type="checkbox" bind:checked={carrito}> Carrito</label>
      <label class="check-row"><input type="checkbox" bind:checked={whatsapp_enabled}> WhatsApp</label>
      <label class="check-row"><input type="checkbox" bind:checked={compartir}> Compartir</label>
      <label class="check-row"><input type="checkbox" bind:checked={variaciones}> Variaciones</label>
    </div>

    {#if error}<div class="error-msg">{error}</div>{/if}
    {#if saved}<div class="saved-msg">✓ Guardado</div>{/if}

    <button class="btn-action" on:click={handleSave} disabled={saving}>
      {saving ? 'Guardando...' : 'Guardar'}
    </button>
  {/if}
</div>

<style>
  .panel-body { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem; }
  .state-msg { padding: 1rem; text-align: center; color: var(--color-text-muted, #888); font-size: 0.8rem; }
  .form-section { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.375rem; }
  .section-title { margin: 0 0 0.25rem 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted, #888); }
  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group.compact { flex: 1; min-width: 0; }
  .form-label { font-size: 0.7rem; color: var(--color-text-muted, #888); font-weight: 500; }
  .form-input { padding: 0.4rem 0.5rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 0.375rem; color: var(--color-text, #e5e5e5); font-size: 0.8rem; font-family: inherit; }
  .form-input:focus { outline: none; border-color: var(--color-primary, #3b82f6); }
  .form-input[type="color"] { padding: 0.15rem; height: 2rem; cursor: pointer; }
  .form-row { display: flex; gap: 0.4rem; }
  .check-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--color-text, #e5e5e5); cursor: pointer; }
  .btn-action { padding: 0.5rem 0.75rem; background: var(--color-primary, #3b82f6); color: white; border: none; border-radius: 0.375rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
  .btn-action:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg { padding: 0.4rem 0.5rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 0.375rem; color: var(--color-error, #ef4444); font-size: 0.75rem; }
  .saved-msg { padding: 0.4rem 0.5rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 0.375rem; color: var(--color-success, #22c55e); font-size: 0.75rem; text-align: center; }
</style>
