<script lang="ts">
  /**
   * WhatsappPanel — vincular el WhatsApp del negocio por QR (open-wa), desde la app.
   *
   * Estados: sin_sesion → [Vincular] → esperando_qr (muestra QR) → conectado → [Desvincular].
   * El QR llega cacheado por whatsapp.estado al abrir, y en vivo por el evento whatsapp.qr.
   */
  import { onMount, onDestroy } from 'svelte';
  import { mqttRequest } from '$lib/ui-core/mqtt-request';
  import { subscribe } from '$lib/ui-core/mqtt';
  import { activeProject } from '$lib/stores/workspace';

  export let panelId: string = '';

  type Estado = 'sin_sesion' | 'esperando_qr' | 'conectado' | 'caida' | 'desconocido';

  let estado: Estado = 'desconocido';
  let qr: string | null = null;
  let depOk = true;
  let loading = false;
  let error: string | null = null;
  let cleanups: Array<() => void> = [];

  // La vertical tienda se identifica por slug (= slugify(nombre)); el frontend tiene el nombre.
  function slugify(s: string): string {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  $: projectSlug = slugify($activeProject?.name || '');

  async function cargarEstado() {
    if (!projectSlug) { estado = 'desconocido'; return; }
    loading = true; error = null;
    try {
      const res = await mqttRequest<{ estado: Estado; qr?: string; dependencia_ok?: boolean }>(
        'whatsapp', 'estado', { project_slug: projectSlug }
      );
      estado = res.data.estado;
      qr = res.data.qr || null;
      depOk = res.data.dependencia_ok !== false;
    } catch (e: any) {
      error = e?.message || 'No se pudo consultar el estado';
    } finally {
      loading = false;
    }
  }

  async function vincular() {
    if (!projectSlug) return;
    loading = true; error = null;
    try {
      await mqttRequest('whatsapp', 'vincular', { project_slug: projectSlug });
      estado = 'esperando_qr';
    } catch (e: any) {
      error = e?.message || 'No se pudo iniciar la vinculación';
    } finally {
      loading = false;
    }
  }

  async function desvincular() {
    if (!projectSlug) return;
    loading = true; error = null;
    try {
      await mqttRequest('whatsapp', 'desvincular', { project_slug: projectSlug });
      estado = 'sin_sesion'; qr = null;
    } catch (e: any) {
      error = e?.message || 'No se pudo desvincular';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    cargarEstado();
    // live: cambios de estado + QR del proyecto activo
    cleanups.push(subscribe('whatsapp.estado', (d: any) => {
      if (!d || (d.project_slug && d.project_slug !== projectSlug)) return;
      estado = d.estado;
      if (d.estado === 'conectado' || d.estado === 'sin_sesion') qr = null;
    }));
    cleanups.push(subscribe('whatsapp.qr', (d: any) => {
      if (!d || (d.project_slug && d.project_slug !== projectSlug)) return;
      qr = d.qr || null;
      estado = 'esperando_qr';
    }));
  });

  onDestroy(() => { cleanups.forEach((c) => c && c()); });
</script>

<div class="wa">
  {#if !projectSlug}
    <p class="muted">Selecciona un proyecto para vincular su WhatsApp.</p>
  {:else if !depOk}
    <div class="aviso">
      open-wa no está instalado en el servidor. Despliega con
      <code>vps-setup.sh</code> (instala <code>@open-wa/wa-automate</code> + Chromium).
    </div>
  {:else if estado === 'conectado'}
    <div class="ok">✅ WhatsApp conectado</div>
    <p class="muted">El número del negocio está vinculado y recibiendo pedidos.</p>
    <button class="btn danger" on:click={desvincular} disabled={loading}>Desvincular</button>
  {:else if estado === 'esperando_qr'}
    <p class="muted">Abre WhatsApp en el móvil del número → <b>Dispositivos vinculados</b> → <b>Vincular dispositivo</b> y escanea:</p>
    {#if qr}
      <div class="qr"><img src={qr} alt="QR para vincular WhatsApp" /></div>
    {:else}
      <p class="muted">Generando el QR…</p>
    {/if}
    <button class="btn ghost" on:click={cargarEstado} disabled={loading}>Refrescar</button>
  {:else}
    <div class="muted">{estado === 'caida' ? 'La sesión se desvinculó. Vuelve a vincular.' : 'WhatsApp sin vincular.'}</div>
    <button class="btn primary" on:click={vincular} disabled={loading}>Vincular WhatsApp</button>
  {/if}

  {#if error}<div class="err">{error}</div>{/if}
</div>

<style>
  .wa { padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--text, #e5e5e5); }
  .muted { color: var(--text-muted, #9aa0a6); font-size: .9rem; margin: 0; }
  .ok { font-size: 1.1rem; font-weight: 700; color: #25d366; }
  .qr { background: #fff; padding: 12px; border-radius: 12px; width: fit-content; }
  .qr img { display: block; width: 240px; height: 240px; }
  .btn { padding: 10px 16px; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: .9rem; width: fit-content; }
  .btn.primary { background: #25d366; color: #07210f; }
  .btn.danger { background: #3a1212; color: #ff8a8a; }
  .btn.ghost { background: transparent; color: var(--text-muted, #9aa0a6); border: 1px solid var(--border, #333); }
  .btn:disabled { opacity: .5; cursor: default; }
  .aviso { background: #2a2410; color: #e6cf7a; padding: 12px; border-radius: 10px; font-size: .85rem; }
  .err { background: #3a1212; color: #ff8a8a; padding: 10px; border-radius: 10px; font-size: .85rem; }
  code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 4px; }
</style>
